/**
 * End-to-end deterministic MULTI-CLIP ASSEMBLY render verification (local,
 * bundled ffmpeg).
 *
 * Proves the new `executeAssembly` engine method stitches SEVERAL clips of
 * DIFFERENT sizes into ONE non-empty MP4 with the bundled `ffmpeg-static` +
 * `ffprobe-static` binaries — no Redis, no workers, no provider. Generates 2–3
 * tiny clips of different sizes (320x240, 640x360) with tones, stubs
 * storage/artifactRepository/jobModel, calls `executeAssembly` targeting
 * 720x1280, and asserts one non-empty MP4 comes out whose dimensions match the
 * target box and whose duration is ≈ the SUM of the stitched clip durations.
 *
 * Skips gracefully if the bundled ffmpeg binary is unavailable in the env.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import ffmpegStatic from 'ffmpeg-static';
// @ts-ignore -- ffprobe-static ships no types
import ffprobeStatic from 'ffprobe-static';

import { DeterministicEditorService } from '../server/features/video-editor/services/deterministic-editor.service';

const execFileAsync = promisify(execFile);
const ffmpegPath = ffmpegStatic as unknown as string | null;
const ffprobePath = (ffprobeStatic as { path?: string } | undefined)?.path;
const hasFfmpeg = !!ffmpegPath && fs.existsSync(ffmpegPath);

const TARGET_WIDTH = 720;
const TARGET_HEIGHT = 1280;

interface Clip {
  buffer: Buffer;
  storageKey: string;
  fileName: string;
  durationSec: number;
}

describe('deterministic multi-clip assembly render (bundled ffmpeg)', () => {
  const workRoot = path.join(os.tmpdir(), `ve-assemble-e2e-${randomUUID()}`);
  const clips: Clip[] = [];

  /** Generate a tiny clip of the given size/duration with a tone. */
  async function makeClip(
    name: string,
    width: number,
    height: number,
    durationSec: number,
    freq: number,
  ): Promise<Clip> {
    const srcPath = path.join(workRoot, name);
    await execFileAsync(ffmpegPath as string, [
      '-y', '-hide_banner', '-nostdin',
      '-f', 'lavfi', '-i', `testsrc=size=${width}x${height}:rate=15:duration=${durationSec}`,
      '-f', 'lavfi', '-i', `sine=frequency=${freq}:duration=${durationSec}`,
      '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac',
      srcPath,
    ]);
    const buffer = fs.readFileSync(srcPath);
    expect(buffer.length).toBeGreaterThan(0);
    return { buffer, storageKey: `sources/${name}`, fileName: name, durationSec };
  }

  beforeAll(async () => {
    if (!hasFfmpeg) return;
    fs.mkdirSync(workRoot, { recursive: true });
    // Three clips of DIFFERENT sizes so the letterbox/pad normalisation is real.
    clips.push(await makeClip('a.mp4', 320, 240, 1, 440));
    clips.push(await makeClip('b.mp4', 640, 360, 1, 660));
    clips.push(await makeClip('c.mp4', 320, 240, 2, 880));
  }, 120_000);

  async function assemble(sources: Clip[]): Promise<Buffer> {
    let capturedOutput: Buffer | null = null;

    const byKey = new Map(sources.map((c) => [c.storageKey, c.buffer]));
    const storage = {
      downloadFile: async (key: string) => {
        const buffer = byKey.get(key);
        if (!buffer) throw new Error(`unknown storage key ${key}`);
        return { buffer, contentType: 'video/mp4' };
      },
      uploadFile: async (input: { buffer: Buffer }) => {
        capturedOutput = input.buffer;
        return { key: 'renders/out.mp4', url: 'https://example/out.mp4', size: input.buffer.length };
      },
    } as any;

    const artifactRepository = {
      createArtifact: async (input: { buffer: Buffer }) => {
        const up = await storage.uploadFile({ buffer: input.buffer });
        return { artifact: { artifactId: 'art-assemble' }, storageKey: up.key, url: up.url };
      },
    } as any;

    const jobModel = { updateOne: () => ({ exec: async () => ({}) }) } as any;

    const service = new DeterministicEditorService({
      storage,
      artifactRepository,
      jobModel,
      tempDir: path.join(workRoot, `work-${randomUUID()}`),
    });

    const result = await service.executeAssembly({
      projectId: 'p1',
      workspaceId: 'w1',
      userId: 'u1',
      jobId: 'job-assemble',
      inputVersionId: 'v0',
      sources: sources.map((c) => ({ storageKey: c.storageKey, fileName: c.fileName })),
      targetWidth: TARGET_WIDTH,
      targetHeight: TARGET_HEIGHT,
      fps: 30,
    });

    expect(result.artifact.artifactId).toBe('art-assemble');
    expect(capturedOutput).not.toBeNull();
    expect((capturedOutput as unknown as Buffer).length).toBeGreaterThan(0);
    return capturedOutput as unknown as Buffer;
  }

  it.runIf(hasFfmpeg)(
    'stitches two different-sized clips into one MP4 at the target dimensions',
    async () => {
      const out = await assemble([clips[0], clips[1]]);
      expect(out.length).toBeGreaterThan(0);

      if (ffprobePath && fs.existsSync(ffprobePath)) {
        const outPath = path.join(workRoot, 'probe-2.mp4');
        fs.writeFileSync(outPath, out);
        const { stdout } = await execFileAsync(ffprobePath, [
          '-v', 'error', '-select_streams', 'v:0',
          '-show_entries', 'stream=width,height',
          '-of', 'csv=p=0', outPath,
        ]);
        expect(stdout.trim()).toBe(`${TARGET_WIDTH},${TARGET_HEIGHT}`);

        // Duration ≈ sum of the two clip durations (1s + 1s = 2s).
        const { stdout: durOut } = await execFileAsync(ffprobePath, [
          '-v', 'error', '-show_entries', 'format=duration',
          '-of', 'csv=p=0', outPath,
        ]);
        const seconds = Number(durOut.trim());
        expect(Number.isFinite(seconds)).toBe(true);
        expect(seconds).toBeGreaterThan(1.6);
        expect(seconds).toBeLessThan(2.6);
      }
    },
    240_000,
  );

  it.runIf(hasFfmpeg)(
    'stitches three clips into one MP4 whose duration ≈ the sum of the parts',
    async () => {
      const out = await assemble([clips[0], clips[1], clips[2]]);
      expect(out.length).toBeGreaterThan(0);

      if (ffprobePath && fs.existsSync(ffprobePath)) {
        const outPath = path.join(workRoot, 'probe-3.mp4');
        fs.writeFileSync(outPath, out);
        const { stdout } = await execFileAsync(ffprobePath, [
          '-v', 'error', '-select_streams', 'v:0',
          '-show_entries', 'stream=width,height',
          '-of', 'csv=p=0', outPath,
        ]);
        expect(stdout.trim()).toBe(`${TARGET_WIDTH},${TARGET_HEIGHT}`);

        // 1s + 1s + 2s = 4s (allow tolerance for keyframe/encoder rounding).
        const { stdout: durOut } = await execFileAsync(ffprobePath, [
          '-v', 'error', '-show_entries', 'format=duration',
          '-of', 'csv=p=0', outPath,
        ]);
        const seconds = Number(durOut.trim());
        expect(seconds).toBeGreaterThan(3.4);
        expect(seconds).toBeLessThan(4.8);
      }
    },
    240_000,
  );

  it.runIf(hasFfmpeg)(
    'refuses to assemble fewer than 2 clips (No-Mock: never invent clips)',
    async () => {
      const service = new DeterministicEditorService({
        storage: { downloadFile: async () => ({ buffer: Buffer.alloc(0), contentType: 'video/mp4' }) } as any,
        artifactRepository: { createArtifact: async () => ({ artifact: { artifactId: 'x' }, storageKey: 'k', url: 'u' }) } as any,
        jobModel: { updateOne: () => ({ exec: async () => ({}) }) } as any,
        tempDir: path.join(workRoot, `work-single-${randomUUID()}`),
      });
      await expect(
        service.executeAssembly({
          projectId: 'p1',
          workspaceId: 'w1',
          userId: 'u1',
          jobId: 'job-single',
          inputVersionId: 'v0',
          sources: [{ storageKey: 'sources/a.mp4', fileName: 'a.mp4' }],
          targetWidth: TARGET_WIDTH,
          targetHeight: TARGET_HEIGHT,
        }),
      ).rejects.toThrow(/at least 2 clips|needs at least 2/i);
    },
    60_000,
  );
});
