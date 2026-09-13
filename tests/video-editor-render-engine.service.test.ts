/**
 * Unit + property tests for the Render_Engine FFmpeg + FFprobe service (task 14.4).
 *
 * Framework: vitest + fast-check.
 *
 * Covers (design.md "Render_Engine", Req 15.1, 15.6, 15.7):
 *  - Renders the authoritative timeline to a real file and, when every
 *    render-validation check passes, stores exactly one immutable `renders`
 *    artifact and marks the job COMPLETED (Req 15.6).
 *  - When any render-validation check fails — or FFmpeg itself fails — marks the
 *    job FAILED with an error code identifying the failed check, retains the input
 *    version, and exposes NO successful render artifact (Req 15.7).
 *  - Service-level soundness: a render succeeds IF AND ONLY IF the pure
 *    render-validation predicate holds for the measured probe (mirrors Req 15.6/15.7).
 *  - Pure FFprobe-mapping helpers.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';

import {
  RenderEngineService,
  deriveExpectedDurationMs,
  timelineExpectsAudio,
  toEncoderProfile,
  normalizeContainer,
  normalizeVideoCodec,
  parseFrameRate,
  mapFfprobe,
  type RenderFfmpegRunner,
  type OutputProber,
  type RenderRequest,
} from '../server/features/video-editor/services/render-engine.service';
import type { OutputProbe } from '../server/features/video-editor/services/quality-controller.logic';
import type { TimelineModel } from '../server/features/video-editor/services/timeline-engine.logic';
import { EXPORT_PROFILES, getExportProfile } from '../server/features/video-editor/config/video-editor.config';

// ---------------------------------------------------------------------------
// Test doubles (real predicates + in-memory stores, not mocks-to-pass)
// ---------------------------------------------------------------------------

/** A fake VideoEditJob model capturing the state/errorCode updates the engine applies. */
function makeJobModel() {
  const updates: { filter: any; update: any }[] = [];
  const jobModel = {
    updateOne(filter: any, update: any) {
      return {
        async exec() {
          updates.push({ filter, update });
        },
      };
    },
  } as any;
  return { jobModel, updates };
}

/** A fake artifact repository capturing every create call. */
function makeArtifactRepo() {
  const created: any[] = [];
  const artifactRepository = {
    async createArtifact(input: any) {
      created.push(input);
      return {
        artifact: { artifactId: 'art-1', ...input } as any,
        storageKey: 'video-editor/p/renders/art-1.mp4',
        url: 'https://storage.local/video-editor/p/renders/art-1.mp4',
      };
    },
  } as any;
  return { artifactRepository, created };
}

/** A storage stub whose download writes deterministic input bytes. */
const storage = {
  async downloadFile(_key: string) {
    return { buffer: Buffer.from('input-bytes'), contentType: 'video/mp4', size: 11 };
  },
} as any;

/** Resolver that always maps an asset id to a fixed storage key + filename. */
const assetResolver = async (_assetId: string) => ({ storageKey: 'sk-1', fileName: 'src.mp4' });

/** A runner that writes a small non-empty output file at the command's output path. */
const writingRunner: RenderFfmpegRunner = async (args) => {
  const outputPath = args[args.length - 1];
  await fs.promises.writeFile(outputPath, Buffer.from('rendered-video-bytes'));
};

/** A runner that produces no output file (simulates a silent FFmpeg no-op). */
const noOutputRunner: RenderFfmpegRunner = async () => {
  /* intentionally writes nothing */
};

/** A runner that fails the FFmpeg process. */
const failingRunner: RenderFfmpegRunner = async () => {
  throw new Error('ffmpeg exited with code 1');
};

const PROFILE_ID = 'vertical_1080p';
const profile = getExportProfile(PROFILE_ID)!;

/** A probe that matches the vertical_1080p profile for a 15 s render. */
function matchingProbe(overrides: Partial<OutputProbe> = {}): OutputProbe {
  return {
    exists: true,
    sizeBytes: 200_000,
    hasVideoStream: true,
    container: profile.container,
    videoCodec: profile.videoCodec,
    audioCodec: 'aac',
    audioStreamCount: 1,
    width: profile.width,
    height: profile.height,
    fps: profile.fps,
    durationMs: 15_000,
    ...overrides,
  };
}

const timeline: TimelineModel = {
  sequences: [{ tracks: 1 }],
  elements: [
    {
      kind: 'clip',
      trackIndex: 0,
      timelineStartMs: 0,
      timelineEndMs: 15_000,
      sourceAssetId: 'src-1',
      sourceInMs: 0,
      sourceOutMs: 15_000,
    },
  ],
};

function makeService(runner: RenderFfmpegRunner, prober: OutputProber) {
  const { jobModel, updates } = makeJobModel();
  const { artifactRepository, created } = makeArtifactRepo();
  const tempDir = path.join(os.tmpdir(), `ve-render-test-${randomUUID()}`);
  const svc = new RenderEngineService({
    storage,
    artifactRepository,
    jobModel,
    assetResolver,
    runner,
    prober,
    tempDir,
    logger: { info() {}, warn() {}, error() {}, debug() {} },
  });
  return { svc, updates, created, tempDir };
}

function baseRequest(): RenderRequest {
  return {
    projectId: 'p-1',
    workspaceId: 'w-1',
    userId: 'u-1',
    jobId: 've-render-p1-v1-op1',
    inputVersionId: 'v-1',
    timeline,
    exportProfileId: PROFILE_ID,
  };
}

// ---------------------------------------------------------------------------
// Success path (Req 15.6)
// ---------------------------------------------------------------------------

describe('RenderEngineService — success path (Req 15.6)', () => {
  it('renders, validates, stores one immutable artifact, and marks the job COMPLETED', async () => {
    const { svc, updates, created } = makeService(writingRunner, async () => matchingProbe());
    const result = await svc.render(baseRequest());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.jobState).toBe('COMPLETED');
    expect(result.artifact.artifactId).toBe('art-1');
    expect(result.outcome.validation.valid).toBe(true);

    // Exactly one artifact, in the `renders` category, deterministic provenance.
    expect(created).toHaveLength(1);
    expect(created[0].category).toBe('renders');
    expect(created[0].deterministic).toBe(true);
    expect(created[0].provenance.jobId).toBe('ve-render-p1-v1-op1');
    expect(created[0].provenance.inputVersionId).toBe('v-1');
    expect(created[0].provenance.provider).toBe('ffmpeg');
    expect(created[0].provenance.costCredits).toBe(0);

    // The job was marked COMPLETED (never overwriting a terminal state).
    const completed = updates.find((u) => u.update?.$set?.state === 'COMPLETED');
    expect(completed).toBeTruthy();
    expect(completed!.filter.state.$nin).toContain('COMPLETED');
  });
});

// ---------------------------------------------------------------------------
// Failure paths (Req 15.7)
// ---------------------------------------------------------------------------

describe('RenderEngineService — failure paths (Req 15.7)', () => {
  it('marks the job FAILED with the failed-check code and stores NO artifact on validation failure', async () => {
    // Duration off by 5 s (> 0.5 s tolerance) → DURATION failure.
    const { svc, updates, created } = makeService(writingRunner, async () =>
      matchingProbe({ durationMs: 20_000 }),
    );
    const result = await svc.render(baseRequest());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.jobState).toBe('FAILED');
    expect(result.errorCode).toBe('RENDER_VALIDATION_DURATION');
    expect(result.failedChecks).toContain('DURATION');

    // No successful render artifact is exposed (Req 15.7).
    expect(created).toHaveLength(0);
    const failed = updates.find((u) => u.update?.$set?.state === 'FAILED');
    expect(failed).toBeTruthy();
    expect(failed!.update.$set.errorCode).toBe('RENDER_VALIDATION_DURATION');
  });

  it('fails with RENDER_VALIDATION_MISSING when FFmpeg produced no output file', async () => {
    const { svc, created } = makeService(noOutputRunner, async () => matchingProbe());
    const result = await svc.render(baseRequest());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe('RENDER_VALIDATION_MISSING');
    expect(result.failedChecks).toContain('MISSING');
    expect(created).toHaveLength(0);
  });

  it('fails with RENDER_FFMPEG_FAILED when the FFmpeg process errors, storing no artifact', async () => {
    const { svc, updates, created } = makeService(failingRunner, async () => matchingProbe());
    const result = await svc.render(baseRequest());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe('RENDER_FFMPEG_FAILED');
    expect(created).toHaveLength(0);
    expect(updates.find((u) => u.update?.$set?.state === 'FAILED')).toBeTruthy();
  });

  it('fails with RENDER_UNKNOWN_PROFILE without invoking FFmpeg for an unknown profile', async () => {
    let ran = false;
    const spyRunner: RenderFfmpegRunner = async () => {
      ran = true;
    };
    const { svc, created } = makeService(spyRunner, async () => matchingProbe());
    const result = await svc.render({ ...baseRequest(), exportProfileId: 'does_not_exist' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe('RENDER_UNKNOWN_PROFILE');
    expect(ran).toBe(false);
    expect(created).toHaveLength(0);
  });

  it('requires an audio stream only when expected, failing AUDIO_MISSING otherwise', async () => {
    const audioTimeline: TimelineModel = {
      sequences: [{ tracks: 2 }],
      elements: [
        ...timeline.elements,
        {
          kind: 'audioClip',
          trackIndex: 1,
          timelineStartMs: 0,
          timelineEndMs: 15_000,
          sourceAssetId: 'src-1',
          sourceInMs: 0,
          sourceOutMs: 15_000,
        },
      ],
    };
    const { svc } = makeService(writingRunner, async () =>
      matchingProbe({ audioStreamCount: 0, audioCodec: null }),
    );
    const result = await svc.render({ ...baseRequest(), timeline: audioTimeline });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failedChecks).toContain('AUDIO_MISSING');
  });
});

// ---------------------------------------------------------------------------
// Service-level soundness (Req 15.6, 15.7)
// ---------------------------------------------------------------------------

describe('RenderEngineService — soundness: success iff validation passes', () => {
  it('property: a render is COMPLETED exactly when every render-validation check passes', async () => {
    const probeArb = fc.record({
      sizeBytes: fc.integer({ min: 0, max: 1_000_000 }),
      hasVideoStream: fc.boolean(),
      container: fc.constantFrom('mp4', 'webm', 'mov', ''),
      videoCodec: fc.constantFrom('h264', 'h265', 'vp9', ''),
      audioStreamCount: fc.integer({ min: 0, max: 2 }),
      width: fc.constantFrom(1080, 1920, 720),
      height: fc.constantFrom(1920, 1080, 1280),
      fps: fc.constantFrom(30, 29.99, 24, 60),
      durationMs: fc.integer({ min: 0, max: 30_000 }),
    });

    await fc.assert(
      fc.asyncProperty(probeArb, async (p) => {
        const probe: OutputProbe = {
          exists: p.sizeBytes > 0,
          sizeBytes: p.sizeBytes,
          hasVideoStream: p.hasVideoStream,
          container: p.container,
          videoCodec: p.videoCodec,
          audioCodec: p.audioStreamCount > 0 ? 'aac' : null,
          audioStreamCount: p.audioStreamCount,
          width: p.width,
          height: p.height,
          fps: p.fps,
          durationMs: p.durationMs,
        };
        const { svc, created } = makeService(writingRunner, async () => probe);
        const result = await svc.render(baseRequest());

        if (result.ok) {
          // Success implies a fully valid file AND exactly one stored artifact.
          expect(result.outcome.validation.valid).toBe(true);
          expect(created).toHaveLength(1);
        } else {
          // Failure never exposes a successful render.
          expect(result.jobState).toBe('FAILED');
          if (result.outcome) expect(result.outcome.validation.valid).toBe(false);
          expect(created).toHaveLength(0);
        }
      }),
      { numRuns: 150 },
    );
  });
});

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe('Render_Engine pure helpers', () => {
  it('deriveExpectedDurationMs returns the max timeline end (0 for empty)', () => {
    expect(deriveExpectedDurationMs({ sequences: [], elements: [] })).toBe(0);
    expect(deriveExpectedDurationMs(timeline)).toBe(15_000);
  });

  it('timelineExpectsAudio is true only when an audioClip is present', () => {
    expect(timelineExpectsAudio(timeline)).toBe(false);
    expect(
      timelineExpectsAudio({
        sequences: [{ tracks: 1 }],
        elements: [{ kind: 'audioClip', trackIndex: 0, timelineStartMs: 0, timelineEndMs: 1 }],
      }),
    ).toBe(true);
  });

  it('toEncoderProfile carries every encoder field from the export profile', () => {
    const enc = toEncoderProfile(EXPORT_PROFILES.vertical_1080p);
    expect(enc).toEqual({
      container: 'mp4',
      videoCodec: 'h264',
      audioCodec: 'aac',
      width: 1080,
      height: 1920,
      fps: 30,
      videoBitrateKbps: 8000,
      audioBitrateKbps: 128,
    });
  });

  it('normalizeContainer collapses an FFprobe format family to the canonical token', () => {
    expect(normalizeContainer('mov,mp4,m4a,3gp,3g2,mj2')).toBe('mp4');
    expect(normalizeContainer('matroska,webm')).toBe('webm');
    expect(normalizeContainer('mov')).toBe('mov');
    expect(normalizeContainer(undefined)).toBe('');
  });

  it('normalizeVideoCodec maps hevc → h265 and passes others through', () => {
    expect(normalizeVideoCodec('hevc')).toBe('h265');
    expect(normalizeVideoCodec('h264')).toBe('h264');
    expect(normalizeVideoCodec('vp9')).toBe('vp9');
  });

  it('parseFrameRate handles rational and scalar rates', () => {
    expect(parseFrameRate('30/1')).toBe(30);
    expect(parseFrameRate('30000/1001')).toBeCloseTo(29.97, 2);
    expect(parseFrameRate('24')).toBe(24);
    expect(parseFrameRate(undefined)).toBe(0);
    expect(parseFrameRate('30/0')).toBe(0);
  });

  it('mapFfprobe maps raw FFprobe data + size into an OutputProbe', () => {
    const data: any = {
      streams: [
        { codec_type: 'video', codec_name: 'h264', width: 1080, height: 1920, r_frame_rate: '30/1' },
        { codec_type: 'audio', codec_name: 'aac' },
      ],
      format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: 15.0 },
    };
    const probe = mapFfprobe(data, 123456);
    expect(probe).toMatchObject({
      exists: true,
      sizeBytes: 123456,
      hasVideoStream: true,
      container: 'mp4',
      videoCodec: 'h264',
      audioCodec: 'aac',
      audioStreamCount: 1,
      width: 1080,
      height: 1920,
      fps: 30,
      durationMs: 15_000,
    });
  });
});
