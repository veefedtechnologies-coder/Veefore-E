/**
 * Unit tests for the EditLocalizationService IO shell (task 5.4).
 *
 * Everything is exercised with INJECTED FAKES — no network, no real FFmpeg:
 *   - `frameRunner`   : a fake that writes N stub JPEGs into the workDir it is
 *                       handed (or throws) instead of spawning FFmpeg. The real
 *                       `sampleFrames` reads the JPEGs back from the workDir, so
 *                       the fake derives the workDir from the frame-pattern arg
 *                       (`<workDir>/frame-%04d.jpg`, always the LAST arg) and
 *                       writes `frame-0001.jpg` … there.
 *   - `clientFactory` : returns a fake `GenerativeVideoClient` whose
 *                       `models.generateContent` returns canned JSON / empty /
 *                       throws.
 *   - `storage`       : a fake `downloadFile` returning source bytes (or throwing).
 *
 * The core contract under test is the No-Mock failure→whole-clip mapping table
 * from the design: every failure point resolves to `{ kind: 'whole-clip' }` and
 * a window is never fabricated. The happy path (valid ranges) yields
 * `{ kind: 'windows' }`.
 *
 * Framework: vitest.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  EditLocalizationService,
  type EditLocalizationDeps,
  type LocalizeInput,
} from '../server/features/video-editor/services/edit-localization.service';
import type { GenerativeVideoClient } from '../server/features/video-editor/services/generative-video.service';

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

/** A per-test scratch root so sampled-frame IO is real, local, and deterministic. */
let TEMP_ROOT: string;

beforeEach(() => {
  TEMP_ROOT = path.join(os.tmpdir(), `edit-localization-test-${randomUUID()}`);
});

afterEach(async () => {
  await fs.promises.rm(TEMP_ROOT, { recursive: true, force: true }).catch(() => {});
});

/** Storage stub returning source bytes for the sampler's download step. */
function fakeStorage(overrides?: { downloadFile?: any }) {
  return {
    downloadFile:
      overrides?.downloadFile ??
      vi.fn().mockResolvedValue({ buffer: Buffer.from('source-video-bytes'), contentType: 'video/mp4' }),
  } as any;
}

/**
 * A fake `frameRunner`. Derives the workDir from the frame-pattern arg (the last
 * arg, `<workDir>/frame-%04d.jpg`) and writes `frameCount` stub JPEG files there
 * so the real `sampleFrames` reads them back. `capturedArgs` records the exact
 * FFmpeg arg vector for assertions.
 */
function makeFrameRunner(frameCount: number) {
  const capturedArgs: string[][] = [];
  const runner = vi.fn(async (args: string[]) => {
    capturedArgs.push(args);
    const framePattern = args[args.length - 1];
    const workDir = path.dirname(framePattern);
    for (let i = 1; i <= frameCount; i++) {
      const name = `frame-${String(i).padStart(4, '0')}.jpg`;
      await fs.promises.writeFile(path.join(workDir, name), Buffer.from(`jpeg-stub-${i}`));
    }
  });
  return { runner, capturedArgs };
}

/** Build a fake vision client with a custom `generateContent`. */
function makeClient(generateContent: any): GenerativeVideoClient {
  return {
    models: {
      generateContent,
      generateVideos: vi.fn(),
    },
    operations: { getVideosOperation: vi.fn() },
    files: { upload: vi.fn(), get: vi.fn(), download: vi.fn() },
  } as unknown as GenerativeVideoClient;
}

/** A `generateContent` mock returning a text response wrapping `body`. */
function textResponse(body: string) {
  return vi.fn().mockResolvedValue({
    candidates: [{ content: { parts: [{ text: body }] } }],
  });
}

/** Standard localize input (10s clip). */
const INPUT: LocalizeInput = {
  projectId: 'p1',
  workspaceId: 'w1',
  userId: 'u1',
  sourceStorageKey: 'video-editor/p1/renders/in.mp4',
  sourceFileName: 'in.mp4',
  instruction: 'remove the person in the background',
  sourceDurationMs: 10_000,
  apiKey: 'test-key',
};

/** Compose a service with fully-injected fakes. */
function makeService(deps: Partial<EditLocalizationDeps>): EditLocalizationService {
  return new EditLocalizationService({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    storage: deps.storage ?? fakeStorage(),
    clientFactory: deps.clientFactory ?? (() => makeClient(vi.fn())),
    frameRunner: deps.frameRunner ?? makeFrameRunner(3).runner,
    tempDir: TEMP_ROOT,
    ffmpegPath: '/does/not/matter',
    config: deps.config,
  });
}

// ---------------------------------------------------------------------------
// Frame_Sampler arg vector construction (Req 3.1, 3.2)
// ---------------------------------------------------------------------------

describe('EditLocalizationService.localize — Frame_Sampler arg vector', () => {
  it('constructs the exact FFmpeg arg vector (fps, scale=-2:height, -q:v 4, -f image2, frame-%04d.jpg)', async () => {
    const { runner, capturedArgs } = makeFrameRunner(3);
    const svc = makeService({
      frameRunner: runner,
      clientFactory: () =>
        makeClient(textResponse(JSON.stringify({ ranges: [{ startMs: 1000, endMs: 3000, confidence: 0.9 }] }))),
    });

    await svc.localize(INPUT);

    expect(runner).toHaveBeenCalledTimes(1);
    const args = capturedArgs[0];

    // -i <inputPath>
    const iIdx = args.indexOf('-i');
    expect(iIdx).toBeGreaterThanOrEqual(0);
    expect(args[iIdx + 1]).toMatch(/input\.mp4$/);

    // -vf fps=1,scale=-2:360  (defaults)
    const vfIdx = args.indexOf('-vf');
    expect(vfIdx).toBeGreaterThanOrEqual(0);
    expect(args[vfIdx + 1]).toBe('fps=1,scale=-2:360');

    // -q:v 4
    const qIdx = args.indexOf('-q:v');
    expect(qIdx).toBeGreaterThanOrEqual(0);
    expect(args[qIdx + 1]).toBe('4');

    // -f image2
    const fIdx = args.indexOf('-f');
    expect(fIdx).toBeGreaterThanOrEqual(0);
    expect(args[fIdx + 1]).toBe('image2');

    // last arg: <workDir>/frame-%04d.jpg
    expect(args[args.length - 1]).toMatch(/frame-%04d\.jpg$/);
  });

  it('honors config overrides in the arg vector (fps and frame height)', async () => {
    const { runner, capturedArgs } = makeFrameRunner(2);
    const svc = makeService({
      frameRunner: runner,
      config: { sampleFps: 2, frameHeight: 480 },
      clientFactory: () =>
        makeClient(textResponse(JSON.stringify({ ranges: [{ startMs: 2000, endMs: 4000, confidence: 0.8 }] }))),
    });

    await svc.localize(INPUT);

    const args = capturedArgs[0];
    const vfIdx = args.indexOf('-vf');
    expect(args[vfIdx + 1]).toBe('fps=2,scale=-2:480');
  });
});

// ---------------------------------------------------------------------------
// Happy path — valid ranges → kind: 'windows'
// ---------------------------------------------------------------------------

describe('EditLocalizationService.localize — happy path', () => {
  it('returns kind: "windows" for valid, in-bounds, confident ranges', async () => {
    const svc = makeService({
      clientFactory: () =>
        makeClient(
          textResponse(
            JSON.stringify({
              ranges: [
                { startMs: 1000, endMs: 3000, confidence: 0.9 },
                { startMs: 5000, endMs: 7000, confidence: 0.8 },
              ],
            }),
          ),
        ),
    });

    const result = await svc.localize(INPUT);

    expect(result.kind).toBe('windows');
    if (result.kind === 'windows') {
      expect(result.windows.length).toBeGreaterThanOrEqual(1);
      for (const w of result.windows) {
        expect(w.startMs).toBeGreaterThanOrEqual(0);
        expect(w.endMs).toBeLessThanOrEqual(INPUT.sourceDurationMs);
        expect(w.startMs).toBeLessThan(w.endMs);
      }
    }
  });

  it('sends the sampled frames + prompt to generateContent (one inlineData part per frame)', async () => {
    const generateContent = textResponse(
      JSON.stringify({ ranges: [{ startMs: 1000, endMs: 3000, confidence: 0.9 }] }),
    );
    const svc = makeService({
      frameRunner: makeFrameRunner(3).runner,
      clientFactory: () => makeClient(generateContent),
    });

    await svc.localize(INPUT);

    expect(generateContent).toHaveBeenCalledTimes(1);
    const callArg = generateContent.mock.calls[0][0];
    const parts = callArg.contents[0].parts;
    const inlineParts = parts.filter((p: any) => p.inlineData);
    const textParts = parts.filter((p: any) => typeof p.text === 'string');
    expect(inlineParts.length).toBe(3); // one JPEG per sampled frame
    expect(inlineParts[0].inlineData.mimeType).toBe('image/jpeg');
    expect(textParts.length).toBe(1);
    expect(textParts[0].text).toContain('remove the person in the background');
  });
});

// ---------------------------------------------------------------------------
// Failure → whole-clip mapping table (No-Mock, Req 6)
// ---------------------------------------------------------------------------

describe('EditLocalizationService.localize — failure → whole-clip fallback', () => {
  it('source download fails → whole-clip', async () => {
    const svc = makeService({
      storage: fakeStorage({ downloadFile: vi.fn().mockRejectedValue(new Error('storage down')) }),
    });
    const result = await svc.localize(INPUT);
    expect(result.kind).toBe('whole-clip');
  });

  it('FFmpeg sampling fails (frameRunner throws) → whole-clip', async () => {
    const svc = makeService({
      frameRunner: vi.fn().mockRejectedValue(new Error('ffmpeg exited with code 1')),
    });
    const result = await svc.localize(INPUT);
    expect(result.kind).toBe('whole-clip');
  });

  it('zero frames produced → whole-clip', async () => {
    // Runner resolves without writing any frame files.
    const svc = makeService({ frameRunner: vi.fn().mockResolvedValue(undefined) });
    const result = await svc.localize(INPUT);
    expect(result.kind).toBe('whole-clip');
  });

  it('generateContent throws → whole-clip', async () => {
    const svc = makeService({
      clientFactory: () => makeClient(vi.fn().mockRejectedValue(new Error('vision 500'))),
    });
    const result = await svc.localize(INPUT);
    expect(result.kind).toBe('whole-clip');
  });

  it('empty / text-only response (no JSON) → whole-clip', async () => {
    const svc = makeService({
      clientFactory: () => makeClient(textResponse('I could not analyze this video.')),
    });
    const result = await svc.localize(INPUT);
    expect(result.kind).toBe('whole-clip');
  });

  it('malformed JSON → whole-clip', async () => {
    const svc = makeService({
      clientFactory: () => makeClient(textResponse('{ "ranges": [ { "startMs": 1000, ')),
    });
    const result = await svc.localize(INPUT);
    expect(result.kind).toBe('whole-clip');
  });

  it('missing "ranges" key → whole-clip', async () => {
    const svc = makeService({
      clientFactory: () => makeClient(textResponse(JSON.stringify({ detections: [] }))),
    });
    const result = await svc.localize(INPUT);
    expect(result.kind).toBe('whole-clip');
  });

  it('{ "ranges": [] } (no candidates) → whole-clip', async () => {
    const svc = makeService({
      clientFactory: () => makeClient(textResponse(JSON.stringify({ ranges: [] }))),
    });
    const result = await svc.localize(INPUT);
    expect(result.kind).toBe('whole-clip');
  });

  it('all candidates below confidence threshold → whole-clip', async () => {
    const svc = makeService({
      clientFactory: () =>
        makeClient(
          textResponse(
            JSON.stringify({
              ranges: [
                { startMs: 1000, endMs: 3000, confidence: 0.1 },
                { startMs: 5000, endMs: 7000, confidence: 0.05 },
              ],
            }),
          ),
        ),
    });
    const result = await svc.localize(INPUT);
    expect(result.kind).toBe('whole-clip');
  });
});
