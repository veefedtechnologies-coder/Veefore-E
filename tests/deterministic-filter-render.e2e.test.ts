/**
 * End-to-end deterministic FILTER / COLOR-GRADE render verification (local,
 * bundled ffmpeg).
 *
 * Proves the new `filter` deterministic operation the chat-driven turn relies on
 * actually renders an output artifact with the bundled `ffmpeg-static` +
 * `ffprobe-static` binaries — no Redis, no workers, no provider. Generates a tiny
 * source clip, runs a REAL `filter` (cinematic colour grade) operation through
 * {@link DeterministicEditorService.execute} with stubbed storage/repository, and
 * asserts a non-empty MP4 comes out whose dimensions match the input (a colour
 * grade never resizes the frame).
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

import {
  DeterministicEditorService,
  FILTER_LOOKS,
  type FilterLook,
} from '../server/features/video-editor/services/deterministic-editor.service';

const execFileAsync = promisify(execFile);
const ffmpegPath = ffmpegStatic as unknown as string | null;
const ffprobePath = (ffprobeStatic as { path?: string } | undefined)?.path;

const hasFfmpeg = !!ffmpegPath && fs.existsSync(ffmpegPath);

/** Source clip dimensions — a colour grade must preserve them exactly. */
const SRC_WIDTH = 320;
const SRC_HEIGHT = 240;

describe('deterministic colour-grade filter render (bundled ffmpeg)', () => {
  let sourceBuffer: Buffer;
  const workRoot = path.join(os.tmpdir(), `ve-filter-e2e-${randomUUID()}`);

  beforeAll(async () => {
    if (!hasFfmpeg) return;
    fs.mkdirSync(workRoot, { recursive: true });
    const srcPath = path.join(workRoot, 'src.mp4');
    // A 1s 320x240 test clip with a tone, encoded like a real upload.
    await execFileAsync(ffmpegPath as string, [
      '-y', '-hide_banner', '-nostdin',
      '-f', 'lavfi', '-i', `testsrc=size=${SRC_WIDTH}x${SRC_HEIGHT}:rate=15:duration=1`,
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1',
      '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac',
      srcPath,
    ]);
    sourceBuffer = fs.readFileSync(srcPath);
    expect(sourceBuffer.length).toBeGreaterThan(0);
  }, 60_000);

  async function renderLook(look: FilterLook): Promise<Buffer> {
    let capturedOutput: Buffer | null = null;

    const storage = {
      downloadFile: async () => ({ buffer: sourceBuffer, contentType: 'video/mp4' }),
      uploadFile: async (input: { buffer: Buffer }) => {
        capturedOutput = input.buffer;
        return { key: 'renders/out.mp4', url: 'https://example/out.mp4', size: input.buffer.length };
      },
    } as any;

    const artifactRepository = {
      createArtifact: async (input: { buffer: Buffer }) => {
        const up = await storage.uploadFile({ buffer: input.buffer });
        return { artifact: { artifactId: `art-${look}` }, storageKey: up.key, url: up.url };
      },
    } as any;

    const jobModel = { updateOne: () => ({ exec: async () => ({}) }) } as any;

    const service = new DeterministicEditorService({
      storage,
      artifactRepository,
      jobModel,
      tempDir: path.join(workRoot, `work-${look}`),
    });

    const result = await service.execute({
      projectId: 'p1',
      workspaceId: 'w1',
      userId: 'u1',
      jobId: `job-filter-${look}`,
      inputVersionId: 'v0',
      sourceStorageKey: 'sources/src.mp4',
      sourceFileName: 'src.mp4',
      operation: { kind: 'filter', params: { look } },
    });

    expect(result.artifact.artifactId).toBe(`art-${look}`);
    expect(capturedOutput).not.toBeNull();
    expect((capturedOutput as unknown as Buffer).length).toBeGreaterThan(0);
    return capturedOutput as unknown as Buffer;
  }

  it.runIf(hasFfmpeg)(
    'renders a non-empty artifact preserving input dimensions for a cinematic grade',
    async () => {
      const out = await renderLook('cinematic');

      // Probe the rendered bytes to confirm a colour grade preserves dimensions.
      if (ffprobePath && fs.existsSync(ffprobePath)) {
        const outPath = path.join(workRoot, 'probe-cinematic.mp4');
        fs.writeFileSync(outPath, out);
        const { stdout } = await execFileAsync(ffprobePath, [
          '-v', 'error', '-select_streams', 'v:0',
          '-show_entries', 'stream=width,height',
          '-of', 'csv=p=0', outPath,
        ]);
        expect(stdout.trim()).toBe(`${SRC_WIDTH},${SRC_HEIGHT}`);
      }
    },
    120_000,
  );

  it.runIf(hasFfmpeg)(
    'renders every named look to a non-empty MP4 that keeps the input dimensions',
    async () => {
      for (const look of FILTER_LOOKS) {
        const out = await renderLook(look);
        expect(out.length).toBeGreaterThan(0);
        if (ffprobePath && fs.existsSync(ffprobePath)) {
          const outPath = path.join(workRoot, `probe-${look}.mp4`);
          fs.writeFileSync(outPath, out);
          const { stdout } = await execFileAsync(ffprobePath, [
            '-v', 'error', '-select_streams', 'v:0',
            '-show_entries', 'stream=width,height',
            '-of', 'csv=p=0', outPath,
          ]);
          expect(stdout.trim()).toBe(`${SRC_WIDTH},${SRC_HEIGHT}`);
        }
      }
    },
    240_000,
  );
});
