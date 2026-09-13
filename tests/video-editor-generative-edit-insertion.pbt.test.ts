/**
 * Property-based test for the Generative_Editor orchestration service
 * (`server/features/video-editor/services/generative-editor.service.ts`).
 *
 * Framework: vitest + fast-check (matching the repo test stack and the existing
 * example tests in `tests/generative-editor.service.test.ts` plus the pure-core
 * property tests in `tests/video-editor-segmentation.logic.test.ts`).
 *
 * Task 17.7 —
 *   Property 25: Validated segments replace their range length-aligned; failures
 *                preserve the timeline.
 *
 *   "For any generative edit, a QC-validated segment is inserted in place of the
 *    original range with duration aligned to the replaced range; and if range
 *    extraction fails or a segment fails QC, the original range/timeline is
 *    retained unchanged and an error is surfaced."
 *
 * **Validates: Requirements 9.12, 9.13, 9.14**
 *
 * Strategy — for ANY well-formed affected region + provider capability bound +
 * (dense) scene-boundary set that the pure segmenter can split into one or more
 * bounded sub-ranges:
 *
 *   - Req 9.12 (length-aligned replacement): when every produced segment passes
 *     QC, the edit COMPLETES, the timeline changes, and every inserted segment's
 *     measured output duration equals the duration of the range it replaced; the
 *     number of timeline insertions equals the number of stored artifacts equals
 *     the number of validated segments.
 *
 *   - Req 9.14 (QC failure preserves the timeline): when a produced segment fails
 *     QC — whether because its duration drifts beyond tolerance (which is exactly
 *     the length-alignment guarantee of Req 9.12) or because it carries a quality
 *     defect — the edit surfaces `quality_failed` and NOTHING is inserted into the
 *     timeline, regardless of how many earlier segments passed.
 *
 *   - Req 9.13 (extraction failure preserves the timeline): when extracting any
 *     sub-range fails, the edit surfaces `extraction_failed` and NOTHING is
 *     inserted into the timeline.
 *
 * Every heavy collaborator (FFmpeg extraction, output probing, storage, the
 * timeline gateway, the provider adapter, the credit ledger) is injected as an
 * in-memory double so the orchestration's real sequencing + failure-preservation
 * logic is exercised without binaries, Redis, MongoDB, or network access.
 *
 * Every property runs ≥100 fast-check iterations with generators shaped to the
 * real input space so the checks are meaningful rather than vacuous.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  GenerativeEditorService,
  type GenerativeEditRequest,
  type SegmentExtractor,
  type SegmentOutputProber,
  type TimelineSegmentGateway,
} from '../server/features/video-editor/services/generative-editor.service';
import { VideoGenerativeMeteringService } from '../server/features/video-editor/services/generative-metering.service';
import type { CreditSettlement } from '../server/features/subscription/services/AICreditMeteringService';
import type {
  VideoAIProvider,
  VideoEditRequest,
  VideoEditResult,
} from '../server/features/video-editor/services/providers/video-ai-provider';
import type { VideoModelCapabilities } from '../server/features/video-editor/services/provider-capability-registry.logic';
import type {
  OutputProbe,
  QualityMetrics,
} from '../server/features/video-editor/services/quality-controller.logic';
import type { TimeRangeMs } from '../server/features/video-editor/services/audio-analysis.logic';
import { QUALITY_CONTROL_THRESHOLDS } from '../server/features/video-editor/config/video-editor.config';

const NUM_RUNS = 200;

// ---------------------------------------------------------------------------
// Injectable doubles
// ---------------------------------------------------------------------------

function makeCapabilities(maxEditableSeconds: number): VideoModelCapabilities {
  return {
    provider: 'gemini',
    model: 'omni-1',
    outputModalities: ['video'],
    outputResolutions: ['1080x1920'],
    outputSeconds: { min: 0, max: 3_600 },
    editableInputSeconds: { min: 0, max: maxEditableSeconds },
    costPerOutputSecondInr: 2,
    guaranteesPreservation: ['face', 'voice'],
  } as VideoModelCapabilities;
}

/** A provider whose edit returns an inline output duration-aligned to the input range. */
function makeAlignedProvider(caps: VideoModelCapabilities): VideoAIProvider & { editCalls: number } {
  const provider = {
    provider: caps.provider,
    model: caps.model,
    editCalls: 0,
    getCapabilities: () => caps,
    estimateCost: async () => ({
      provider: caps.provider,
      model: caps.model,
      outputSeconds: 1,
      costInr: caps.costPerOutputSecondInr,
      currency: 'INR' as const,
    }),
    async edit(req: VideoEditRequest): Promise<VideoEditResult> {
      provider.editCalls += 1;
      const startMs = req.affectedRangeMs?.startMs ?? 0;
      const endMs = req.affectedRangeMs?.endMs ?? 1000;
      return {
        provider: caps.provider,
        model: caps.model,
        output: {
          videoBase64: Buffer.from('output-bytes').toString('base64'),
          mimeType: 'video/mp4',
          // Duration-aligned to the replaced range (Req 9.12).
          outputSeconds: (endMs - startMs) / 1000,
        },
      };
    },
    generate: async () => {
      throw new Error('not used');
    },
    getIntegrationStatus: () => ({
      provider: caps.provider,
      model: caps.model,
      integrated: true,
      integratedOperations: ['edit'] as const,
      lastSuccessAt: Date.now(),
      lastError: null,
    }),
    isIntegrated: () => true,
  };
  return provider as unknown as VideoAIProvider & { editCalls: number };
}

/** A credit ledger double with an effectively unlimited balance. */
function makeLedger() {
  return {
    async ensureCreditAccount() {
      return 1_000_000;
    },
    async runMetered<T>(
      _feature: string,
      _usageFeature: string,
      _ctx: unknown,
      operation: (signal?: AbortSignal) => Promise<T>,
      _additionalProviderCostInr = 0,
      signal?: AbortSignal,
    ): Promise<{ result: T; settlement: CreditSettlement }> {
      const result = await operation(signal);
      return { result, settlement: { charged: 3, remaining: 999_997 } };
    },
  };
}

/** An artifact repository double recording each stored (immutable) artifact. */
function makeArtifactRepo() {
  return {
    created: [] as unknown[],
    async createArtifact(input: unknown) {
      const artifactId = `artifact-${this.created.length + 1}`;
      this.created.push(input);
      return {
        artifact: { artifactId } as never,
        storageKey: `key/${artifactId}.mp4`,
        url: `https://storage/${artifactId}.mp4`,
      };
    },
  };
}

/** A timeline gateway double recording every insertion (the only timeline mutation). */
function makeTimelineGateway(): TimelineSegmentGateway & { inserts: unknown[] } {
  const gateway = {
    inserts: [] as unknown[],
    async insertValidatedSegment(input: unknown) {
      gateway.inserts.push(input);
      return { ok: true as const };
    },
  };
  return gateway;
}

/** A probe/metrics pair for a clean, duration-aligned segment (passes QC). */
function cleanProbeFor(durationMs: number): { probe: OutputProbe; metrics: QualityMetrics } {
  const probe: OutputProbe = {
    exists: true,
    sizeBytes: 1024,
    hasVideoStream: true,
    container: 'mp4',
    videoCodec: 'h264',
    audioCodec: 'aac',
    audioStreamCount: 1,
    width: 1080,
    height: 1920,
    fps: 30,
    durationMs,
  };
  const metrics: QualityMetrics = {
    longestBlackRunMs: 0,
    longestFrozenRunMs: 0,
    audioExpected: true,
    audioPresent: true,
    audioSilentFraction: 0,
    maxArtifactAreaFraction: 0,
    measuredDurationMs: durationMs,
  };
  return { probe, metrics };
}

/** A prober that always reports a clean, duration-aligned segment. */
const passingProber: SegmentOutputProber = async ({ output }) =>
  cleanProbeFor(Math.round(output.outputSeconds * 1000));

/** An extractor returning small fake bytes for any range. */
const okExtractor: SegmentExtractor = async ({ range }) => ({
  buffer: Buffer.from('segment-bytes'),
  mimeType: 'video/mp4',
  durationMs: range.endMs - range.startMs,
});

function makeService(deps: {
  maxEditableSeconds: number;
  extractor?: SegmentExtractor;
  prober?: SegmentOutputProber;
  gateway: TimelineSegmentGateway;
}) {
  const caps = makeCapabilities(deps.maxEditableSeconds);
  const provider = makeAlignedProvider(caps);
  const ledger = makeLedger();
  const metering = new VideoGenerativeMeteringService({ ledger });
  const artifactRepository = makeArtifactRepo();
  const jobModel = { updateOne: () => ({ exec: async () => ({}) }) } as never;
  const svc = new GenerativeEditorService({
    metering,
    artifactRepository: artifactRepository as never,
    timelineGateway: deps.gateway,
    jobModel,
    segmentExtractor: deps.extractor ?? okExtractor,
    outputProber: deps.prober ?? passingProber,
  });
  return { svc, provider, artifactRepository, caps };
}

// ---------------------------------------------------------------------------
// Generators — a splittable edit (segmentation always yields ≥1 sub-range)
// ---------------------------------------------------------------------------

interface EditScenario {
  affectedRegion: TimeRangeMs;
  maxEditableSeconds: number;
  sceneBoundariesMs: number[];
}

/**
 * A well-formed affected region plus a capability bound and a DENSE set of scene
 * boundaries (one every ~half the capability window), so the pure segmenter can
 * always partition the region into one or more bounded, gap-free sub-ranges.
 * This keeps the orchestration on its real success path rather than short-
 * circuiting on `reroute_required`/`invalid_input`.
 */
const scenarioArb: fc.Arbitrary<EditScenario> = fc
  .record({
    startMs: fc.integer({ min: 0, max: 20_000 }),
    lenMs: fc.integer({ min: 1_000, max: 40_000 }),
    maxEditableSeconds: fc.integer({ min: 3, max: 30 }),
  })
  .map(({ startMs, lenMs, maxEditableSeconds }) => {
    const affectedRegion: TimeRangeMs = { startMs, endMs: startMs + lenMs };
    const maxDurationMs = maxEditableSeconds * 1000;
    const step = Math.max(1, Math.floor(maxDurationMs / 2));
    const sceneBoundariesMs: number[] = [];
    for (let t = affectedRegion.startMs + step; t < affectedRegion.endMs; t += step) {
      sceneBoundariesMs.push(t);
    }
    return { affectedRegion, maxEditableSeconds, sceneBoundariesMs };
  });

function baseRequest(scenario: EditScenario, provider: VideoAIProvider): GenerativeEditRequest {
  return {
    projectId: 'proj-1',
    workspaceId: 'ws-1',
    userId: 'user-1',
    jobId: 'job-1',
    inputVersionId: 'ver-0',
    versionId: 'ver-1',
    source: {
      storageKey: 'src/key.mp4',
      fileName: 'source.mp4',
      durationMs: scenario.affectedRegion.endMs + 60_000,
    },
    affectedRegion: scenario.affectedRegion,
    segmentation: {
      caps: { editableInputSeconds: { min: 0, max: scenario.maxEditableSeconds } },
      sceneBoundariesMs: scenario.sceneBoundariesMs,
    },
    prompt: {
      // A required Protected_Element the provider guarantees → INVOKE (no warning).
      userRequest: 'remove the background object',
      requiredProtectedElements: ['face'],
      operationType: 'object_removal',
    },
    provider,
    metering: { idempotencyKey: 've-job-1', confirm: async () => true },
    outputResolution: '1080x1920',
  };
}

const rangeMs = (r: TimeRangeMs) => r.endMs - r.startMs;

// ===========================================================================
// Property 25 — Req 9.12: validated segments replace their range length-aligned
// ===========================================================================

describe('Property 25: validated segments replace their range length-aligned (Req 9.12)', () => {
  it('every inserted segment is duration-aligned to the range it replaces; inserts == artifacts == segments', async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async (scenario) => {
        const gateway = makeTimelineGateway();
        const { svc, provider, artifactRepository } = makeService({
          maxEditableSeconds: scenario.maxEditableSeconds,
          gateway,
        });

        const result = await svc.runGenerativeEdit(baseRequest(scenario, provider));

        // A splittable region + passing QC always completes.
        expect(result.status).toBe('completed');
        if (result.status !== 'completed') return;

        expect(result.timelineChanged).toBe(true);
        expect(result.segments.length).toBeGreaterThanOrEqual(1);

        // Req 9.12: each segment's measured output duration equals the replaced range.
        for (const seg of result.segments) {
          expect(seg.outputDurationMs).toBe(rangeMs(seg.range));
        }

        // The validated segments exactly cover the affected region (each replaces
        // its range in place, contiguously) — a further length-alignment check.
        const sorted = [...result.segments].sort((a, b) => a.range.startMs - b.range.startMs);
        expect(sorted[0].range.startMs).toBe(scenario.affectedRegion.startMs);
        expect(sorted[sorted.length - 1].range.endMs).toBe(scenario.affectedRegion.endMs);
        for (let i = 1; i < sorted.length; i++) {
          expect(sorted[i].range.startMs).toBe(sorted[i - 1].range.endMs);
        }

        // One immutable artifact stored and one timeline insertion per segment.
        expect(artifactRepository.created.length).toBe(result.segments.length);
        expect(gateway.inserts.length).toBe(result.segments.length);
        expect(provider.editCalls).toBe(result.segments.length);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

// ===========================================================================
// Property 25 — Req 9.14: a QC failure preserves the timeline
// ===========================================================================

describe('Property 25: a segment failing QC preserves the timeline (Req 9.14, 9.12)', () => {
  it('a duration drift beyond tolerance or a quality defect surfaces quality_failed and inserts nothing', async () => {
    const drift = QUALITY_CONTROL_THRESHOLDS.durationToleranceMs + 1_500; // reliably beyond tolerance

    await fc.assert(
      fc.asyncProperty(
        scenarioArb,
        // Which produced segment fails, and how it fails.
        fc.integer({ min: 1, max: 5 }),
        fc.constantFrom<'duration_drift' | 'black_frames'>('duration_drift', 'black_frames'),
        async (scenario, failAtCall, mode) => {
          const gateway = makeTimelineGateway();

          // A prober that passes the first `failAtCall - 1` segments then fails one.
          let calls = 0;
          let didFail = false;
          const failingProber: SegmentOutputProber = async ({ output }) => {
            calls += 1;
            const alignedMs = Math.round(output.outputSeconds * 1000);
            const { probe, metrics } = cleanProbeFor(alignedMs);
            if (calls === failAtCall) {
              didFail = true;
              if (mode === 'duration_drift') {
                // Req 9.12: a segment whose duration drifts from its range fails QC.
                return {
                  probe: { ...probe, durationMs: alignedMs + drift },
                  metrics: { ...metrics, measuredDurationMs: alignedMs + drift },
                };
              }
              // A pure quality defect (long fully-black run).
              return {
                probe,
                metrics: { ...metrics, longestBlackRunMs: 10_000 },
              };
            }
            return { probe, metrics };
          };

          const { svc, provider } = makeService({
            maxEditableSeconds: scenario.maxEditableSeconds,
            gateway,
            prober: failingProber,
          });

          const result = await svc.runGenerativeEdit(baseRequest(scenario, provider));

          if (didFail) {
            // Req 9.14: the failed segment is never inserted; the timeline is preserved.
            expect(result.status).toBe('quality_failed');
            expect(gateway.inserts.length).toBe(0);
          } else {
            // Fewer sub-ranges than `failAtCall`: no segment failed → normal completion.
            expect(result.status).toBe('completed');
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});

// ===========================================================================
// Property 25 — Req 9.13: an extraction failure preserves the timeline
// ===========================================================================

describe('Property 25: an extraction failure preserves the timeline (Req 9.13)', () => {
  it('a failed sub-range extraction surfaces extraction_failed and inserts nothing', async () => {
    await fc.assert(
      fc.asyncProperty(
        scenarioArb,
        fc.integer({ min: 1, max: 5 }),
        async (scenario, failAtCall) => {
          const gateway = makeTimelineGateway();

          let calls = 0;
          let didFail = false;
          const failingExtractor: SegmentExtractor = async ({ range }) => {
            calls += 1;
            if (calls === failAtCall) {
              didFail = true;
              throw new Error('ffmpeg extraction crashed');
            }
            return {
              buffer: Buffer.from('segment-bytes'),
              mimeType: 'video/mp4',
              durationMs: range.endMs - range.startMs,
            };
          };

          const { svc, provider, artifactRepository } = makeService({
            maxEditableSeconds: scenario.maxEditableSeconds,
            gateway,
            extractor: failingExtractor,
          });

          const result = await svc.runGenerativeEdit(baseRequest(scenario, provider));

          if (didFail) {
            // Req 9.13: the edit aborts and the timeline is never mutated.
            expect(result.status).toBe('extraction_failed');
            expect(gateway.inserts.length).toBe(0);
            // Nothing produced after the failed extraction is inserted; because the
            // failing segment aborts before any provider output for it is stored,
            // stored artifacts are strictly fewer than the number of segments and
            // never reach the timeline.
            expect(artifactRepository.created.length).toBeLessThan(calls);
          } else {
            expect(result.status).toBe('completed');
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
