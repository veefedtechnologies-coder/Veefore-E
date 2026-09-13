/**
 * End-to-end deterministic render verification (local, bundled ffmpeg).
 *
 * Proves the deterministic edit path the chat-driven turn relies on actually
 * renders an output artifact with the bundled `ffmpeg-static` + `ffprobe-static`
 * binaries — no Redis, no workers, no provider. Generates a tiny source clip,
 * runs a REAL `aspect` (reframe → 9:16) operation through
 * {@link DeterministicEditorService.execute} with stubbed storage/repository, and
 * asserts a non-empty 1080×1920 MP4 comes out.
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

describe('deterministic reframe render (bundled ffmpeg)', () => {
  let sourceBuffer: Buffer;
  const workRoot = path.join(os.tmpdir(), `ve-e2e-${randomUUID()}`);

  beforeAll(async () => {
    if (!hasFfmpeg) return;
    fs.mkdirSync(workRoot, { recursive: true });
    const srcPath = path.join(workRoot, 'src.mp4');
    // A 1s 320x240 test clip with a tone, encoded like a real upload.
    await execFileAsync(ffmpegPath as string, [
      '-y', '-hide_banner', '-nostdin',
      '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=15:duration=1',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1',
      '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac',
      srcPath,
    ]);
    sourceBuffer = fs.readFileSync(srcPath);
    expect(sourceBuffer.length).toBeGreaterThan(0);
  }, 60_000);

  it.runIf(hasFfmpeg)(
    'renders a non-empty 1080x1920 artifact from an aspect reframe',
    async () => {
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
          return {
            artifact: { artifactId: 'art-e2e' },
            storageKey: up.key,
            url: up.url,
          };
        },
      } as any;

      const jobModel = { updateOne: () => ({ exec: async () => ({}) }) } as any;

      const service = new DeterministicEditorService({
        storage,
        artifactRepository,
        jobModel,
        tempDir: path.join(workRoot, 'work'),
      });

      const result = await service.execute({
        projectId: 'p1',
        workspaceId: 'w1',
        userId: 'u1',
        jobId: 'job-e2e',
        inputVersionId: 'v0',
        sourceStorageKey: 'sources/src.mp4',
        sourceFileName: 'src.mp4',
        operation: {
          kind: 'aspect',
          params: { aspectRatio: '9:16', width: 1080, height: 1920, mode: 'pad' },
        },
      });

      expect(result.artifact.artifactId).toBe('art-e2e');
      expect(capturedOutput).not.toBeNull();
      expect((capturedOutput as unknown as Buffer).length).toBeGreaterThan(0);

      // Probe the rendered bytes to confirm the reframe produced 1080x1920.
      if (ffprobePath && fs.existsSync(ffprobePath)) {
        const outPath = path.join(workRoot, 'probe.mp4');
        fs.writeFileSync(outPath, capturedOutput as unknown as Buffer);
        const { stdout } = await execFileAsync(ffprobePath, [
          '-v', 'error', '-select_streams', 'v:0',
          '-show_entries', 'stream=width,height',
          '-of', 'csv=p=0', outPath,
        ]);
        expect(stdout.trim()).toBe('1080,1920');
      }
    },
    120_000,
  );
});
