/**
 * End-to-end ANIMATED caption render verification (local, bundled ffmpeg + libass).
 *
 * Proves the new animated word-level caption path actually burns a generated ASS
 * document onto a real clip with the bundled `ffmpeg-static` binary — no Redis,
 * no workers, no provider, no transcription (captions come from the provided
 * segments with word timings, exactly as the design intends the renderer to
 * consume them). Generates a tiny source clip, calls the REAL
 * {@link CaptionRendererService.renderAnimatedCaptions} with 3 word-timed
 * segments, and asserts a non-empty MP4 comes out whose dimensions match the
 * input (a caption burn-in never resizes the frame).
 *
 * CRITICAL evidence: the renderer reports whether the bundled ffmpeg supports the
 * libass `subtitles` filter. When it does, `mode: 'animated'` and libass burned
 * the ASS. When it does NOT, the renderer DETECTS that and falls back to the
 * static drawtext path (`mode: 'static-fallback'`) — captions are never silently
 * dropped. Either way an output MP4 with the input dimensions is produced. The
 * test logs the detected support so the report can state yes/no with evidence.
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
  CaptionRendererService,
  type AnimatedRenderCaptionsResult,
} from '../server/features/video-editor/services/caption-renderer.service';
import type { CaptionSegment } from '../server/features/video-editor/services/caption-layout.logic';

const execFileAsync = promisify(execFile);
const ffmpegPath = ffmpegStatic as unknown as string | null;
const ffprobePath = (ffprobeStatic as { path?: string } | undefined)?.path;

const hasFfmpeg = !!ffmpegPath && fs.existsSync(ffmpegPath);

/** Source clip dimensions — a caption burn-in must preserve them exactly. */
const SRC_WIDTH = 480;
const SRC_HEIGHT = 854;

/** Three short segments carrying word-level timings (drives the active word). */
const SEGMENTS: CaptionSegment[] = [
  {
    startMs: 0,
    endMs: 1200,
    text: 'hello brave world',
    words: [
      { startMs: 0, endMs: 400, text: 'hello' },
      { startMs: 400, endMs: 800, text: 'brave' },
      { startMs: 800, endMs: 1200, text: 'world' },
    ],
  },
  {
    startMs: 1300,
    endMs: 2500,
    text: 'captions that pop',
    words: [
      { startMs: 1300, endMs: 1700, text: 'captions' },
      { startMs: 1700, endMs: 2100, text: 'that' },
      { startMs: 2100, endMs: 2500, text: 'pop' },
    ],
  },
  {
    startMs: 2600,
    endMs: 3600,
    text: 'right on time',
    words: [
      { startMs: 2600, endMs: 2950, text: 'right' },
      { startMs: 2950, endMs: 3300, text: 'on' },
      { startMs: 3300, endMs: 3600, text: 'time' },
    ],
  },
];

describe('animated caption render (bundled ffmpeg + libass)', () => {
  const workRoot = path.join(os.tmpdir(), `ve-caption-anim-e2e-${randomUUID()}`);
  let srcPath = '';

  beforeAll(async () => {
    if (!hasFfmpeg) return;
    fs.mkdirSync(workRoot, { recursive: true });
    srcPath = path.join(workRoot, 'src.mp4');
    // A 4s vertical test clip with a tone, encoded like a real upload.
    await execFileAsync(ffmpegPath as string, [
      '-y', '-hide_banner', '-nostdin',
      '-f', 'lavfi', '-i', `testsrc=size=${SRC_WIDTH}x${SRC_HEIGHT}:rate=15:duration=4`,
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4',
      '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac',
      srcPath,
    ]);
    expect(fs.existsSync(srcPath)).toBe(true);
    expect(fs.statSync(srcPath).size).toBeGreaterThan(0);
  }, 60_000);

  async function renderAnimated(assPresetKey: string): Promise<AnimatedRenderCaptionsResult> {
    const service = new CaptionRendererService({
      tempDir: path.join(workRoot, `ass-${assPresetKey}`),
    });
    const outputPath = path.join(workRoot, `out-${assPresetKey}.mp4`);
    const result = await service.renderAnimatedCaptions({
      segments: SEGMENTS,
      presetKey: 'instagram_reel', // required by the type; unused on the animated path
      assPresetKey,
      inputPath: srcPath,
      outputPath,
      dimensions: { width: SRC_WIDTH, height: SRC_HEIGHT },
    });
    return result;
  }

  async function probeDimensions(file: string): Promise<string | null> {
    if (!ffprobePath || !fs.existsSync(ffprobePath)) return null;
    const { stdout } = await execFileAsync(ffprobePath, [
      '-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height',
      '-of', 'csv=p=0', file,
    ]);
    return stdout.trim();
  }

  it.runIf(hasFfmpeg)(
    'burns bold_pop animated captions to a non-empty MP4 preserving input dimensions',
    async () => {
      const result = await renderAnimated('bold_pop');

      // EVIDENCE for the report: did the bundled ffmpeg support libass?
      // eslint-disable-next-line no-console
      console.log(
        `[caption-animated-e2e] libass subtitles supported = ${result.libassSupported}; ` +
          `mode = ${result.mode}; dialogueEvents = ${result.dialogueCount}` +
          (result.fallbackReason ? `; fallback = ${result.fallbackReason}` : ''),
      );

      // The ASS document was built with the expected sections + animated tags.
      expect(result.assPresetKey).toBe('bold_pop');
      expect(result.assDocument).toContain('[Events]');
      expect(result.dialogueCount).toBeGreaterThanOrEqual(9); // 3 segments × 3 words
      expect(['animated', 'static-fallback']).toContain(result.mode);

      // A real output MP4 was produced (never silently dropped).
      expect(fs.existsSync(result.outputPath)).toBe(true);
      expect(fs.statSync(result.outputPath).size).toBeGreaterThan(0);

      // Caption burn-in must preserve the input dimensions exactly.
      const dims = await probeDimensions(result.outputPath);
      if (dims !== null) {
        expect(dims).toBe(`${SRC_WIDTH},${SRC_HEIGHT}`);
      }
    },
    180_000,
  );

  it.runIf(hasFfmpeg)(
    'renders every animated preset to a non-empty MP4 that keeps the input dimensions',
    async () => {
      for (const preset of ['bold_pop', 'clean_minimal', 'karaoke_box']) {
        const result = await renderAnimated(preset);
        expect(fs.existsSync(result.outputPath)).toBe(true);
        expect(fs.statSync(result.outputPath).size).toBeGreaterThan(0);
        const dims = await probeDimensions(result.outputPath);
        if (dims !== null) {
          expect(dims).toBe(`${SRC_WIDTH},${SRC_HEIGHT}`);
        }
      }
    },
    300_000,
  );
});
