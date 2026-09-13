/**
 * End-to-end deterministic AUTO-CUT (beat-synced montage) render verification
 * (local, bundled ffmpeg) — Increment 2.
 *
 * Proves the `auto_cut` deterministic operation the chat-driven turn relies on
 * actually assembles the pre-computed keep-segments into a single non-empty MP4
 * with the bundled `ffmpeg-static` + `ffprobe-static` binaries — no Redis, no
 * workers, no provider, no audio analysis in the engine (the engine only RENDERS
 * the segments the pure `computeAutoCutSegments` produced). Also exercises the
 * optional subtle punch-in zoom.
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

const SRC_WIDTH = 320;
const SRC_HEIGHT = 240;

describe('deterministic auto-cut montage render (bundled ffmpeg)', () => {
  let sourceBuffer: Buffer;
  const workRoot = path.join(os.tmpdir(), `ve-autocut-e2e-${randomUUID()}`);

  beforeAll(async () => {
    if (!hasFfmpeg) return;
    fs.mkdirSync(workRoot, { recursive: true });
    const srcPath = path.join(workRoot, 'src.mp4');
    // A 4s clip with video + tone so both streams are re-timed by the montage.
    await execFileAsync(ffmpegPath as string, [
      '-y', '-hide_banner', '-nostdin',
      '-f', 'lavfi', '-i', `testsrc=size=${SRC_WIDTH}x${SRC_HEIGHT}:rate=15:duration=4`,
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4',
      '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac',
      srcPath,
    ]);
    sourceBuffer = fs.readFileSync(srcPath);
    expect(sourceBuffer.length).toBeGreaterThan(0);
  }, 60_000);

  async function renderMontage(
    segments: { startMs: number; endMs: number }[],
    punchInZoom: boolean,
  ): Promise<Buffer> {
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
        return { artifact: { artifactId: 'art-autocut' }, storageKey: up.key, url: up.url };
      },
    } as any;

    const jobModel = { updateOne: () => ({ exec: async () => ({}) }) } as any;

    const service = new DeterministicEditorService({
      storage,
      artifactRepository,
      jobModel,
      tempDir: path.join(workRoot, `work-${punchInZoom ? 'zoom' : 'flat'}`),
    });

    const result = await service.execute({
      projectId: 'p1',
      workspaceId: 'w1',
      userId: 'u1',
      jobId: 'job-autocut',
      inputVersionId: 'v0',
      sourceStorageKey: 'sources/src.mp4',
      sourceFileName: 'src.mp4',
      operation: { kind: 'auto_cut', params: { segments, punchInZoom } },
    });

    expect(result.artifact.artifactId).toBe('art-autocut');
    expect(capturedOutput).not.toBeNull();
    expect((capturedOutput as unknown as Buffer).length).toBeGreaterThan(0);
    return capturedOutput as unknown as Buffer;
  }

  it.runIf(hasFfmpeg)(
    'renders a non-empty montage MP4 from pre-computed keep-segments',
    async () => {
      const out = await renderMontage(
        [
          { startMs: 0, endMs: 1500 },
          { startMs: 1500, endMs: 3000 },
          { startMs: 3000, endMs: 4000 },
        ],
        false,
      );
      if (ffprobePath && fs.existsSync(ffprobePath)) {
        const outPath = path.join(workRoot, 'probe-flat.mp4');
        fs.writeFileSync(outPath, out);
        const { stdout } = await execFileAsync(ffprobePath, [
          '-v', 'error', '-select_streams', 'v:0',
          '-show_entries', 'stream=width,height',
          '-of', 'csv=p=0', outPath,
        ]);
        // A plain montage preserves the source frame dimensions.
        expect(stdout.trim()).toBe(`${SRC_WIDTH},${SRC_HEIGHT}`);
      }
    },
    120_000,
  );

  it.runIf(hasFfmpeg)(
    'renders a non-empty montage MP4 with the optional punch-in zoom',
    async () => {
      const out = await renderMontage(
        [
          { startMs: 0, endMs: 2000 },
          { startMs: 2000, endMs: 4000 },
        ],
        true,
      );
      expect(out.length).toBeGreaterThan(0);
    },
    120_000,
  );
});
