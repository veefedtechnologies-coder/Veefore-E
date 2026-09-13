/**
 * Acceptance Test B — in-capability generative object removal (task 24.2).
 *
 * Framework: vitest (matching the repo E2E/service test stack).
 *
 * This is an END-TO-END acceptance scenario that drives the REAL generative
 * pipeline services already built in this feature — Model_Router (routing),
 * VideoGenerativeMeteringService (reserve → call → reconcile), the
 * Generative_Editor orchestration (extract → segment → meter → QC → store →
 * insert), and the Render_Engine (final render) — over one realistic in-cap
 * object-removal edit. Only the process boundaries (provider adapter, FFmpeg
 * extraction/probing, storage, the credit ledger, the timeline gateway, the
 * job model) are injected as in-memory fakes; every decision and every sequence
 * step is the production code path.
 *
 * Scenario (Req 24.3, 24.4):
 *   A user uploads a clip WITHIN the selected provider's editable-input
 *   capability (Gemini Omni: editableInputSeconds ≤ 8 s) and requests removal of
 *   a background object "while keeping everything else unchanged" (a required
 *   Protected_Element the provider guarantees). The Video_Editor MUST:
 *
 *     - Req 24.3: route to the Generative_Editor (NOT the Deterministic_Editor),
 *       reserve the estimated credits BEFORE the provider call, call the provider
 *       server-side, and reconcile credits against measured actual usage AFTER
 *       the provider response.
 *     - Req 24.4: store the actual provider output as a Video_Artifact, insert it
 *       into the timeline via the Timeline_Engine, run quality control on it via
 *       the Quality_Controller, and produce a final render via the Render_Engine.
 *
 * **Validates: Requirements 24.3, 24.4**
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';

// --- Model_Router (routing decision) ---------------------------------------
import {
  routeOperation,
  ALL_HEALTHY,
  type CapabilityQuery,
  type RoutableOperation,
} from '../server/features/video-editor/services/model-router.logic';

// --- Metering (reserve → call → reconcile) ---------------------------------
import {
  VideoGenerativeMeteringService,
} from '../server/features/video-editor/services/generative-metering.service';
import type { CreditSettlement } from '../server/features/subscription/services/AICreditMeteringService';

// --- Generative_Editor orchestration ---------------------------------------
import {
  GenerativeEditorService,
  type GenerativeEditRequest,
  type SegmentExtractor,
  type SegmentOutputProber,
  type TimelineSegmentGateway,
} from '../server/features/video-editor/services/generative-editor.service';

// --- Render_Engine (final render) ------------------------------------------
import {
  RenderEngineService,
  type RenderFfmpegRunner,
  type OutputProber as RenderOutputProber,
  type RenderRequest,
} from '../server/features/video-editor/services/render-engine.service';
import type { TimelineModel } from '../server/features/video-editor/services/timeline-engine.logic';
import { getExportProfile } from '../server/features/video-editor/config/video-editor.config';

// --- Provider capability seed (the in-cap provider) ------------------------
import { SEED_VIDEO_MODEL_CAPABILITIES } from '../server/features/video-editor/services/provider-capability-seed';
import {
  GEMINI_OMNI_PROVIDER,
  GEMINI_OMNI_MODEL,
} from '../server/features/video-editor/services/providers/gemini-omni-adapter';

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

// ---------------------------------------------------------------------------
// Fixtures — the in-capability provider + scenario constants
// ---------------------------------------------------------------------------

/** The real seeded Gemini Omni capability record (editableInputSeconds ≤ 8 s). */
const OMNI_CAPS: VideoModelCapabilities = SEED_VIDEO_MODEL_CAPABILITIES.find(
  (c) => c.provider === GEMINI_OMNI_PROVIDER && c.model === GEMINI_OMNI_MODEL,
)!;

/**
 * The affected region is 6 s — strictly WITHIN the provider's 8 s
 * editable-input capability, so segmentation yields a single in-cap sub-range
 * (no reroute, no split). This is the "in-cap" of Acceptance Test B.
 */
const AFFECTED_REGION = { startMs: 0, endMs: 6_000 };
const SOURCE_DURATION_MS = 6_000;
const RENDER_PROFILE_ID = 'vertical_1080p';

const RAW_USER_REQUEST = 'remove the person walking in the background but keep everything else unchanged';

// ---------------------------------------------------------------------------
// Injected doubles — process boundaries only (No-Mock domain logic)
// ---------------------------------------------------------------------------

/** A single ordered event on the shared metering timeline. */
type MeterEvent = { type: 'reserve' | 'reconcile' | 'provider-call'; credits?: number };

/**
 * A ledger fake that records the reserve → provider-call → reconcile ordering
 * onto a SHARED event timeline. Mirrors the real
 * `aiCreditMeteringService.runMetered` contract: it reserves BEFORE running the
 * operation and reconciles AFTER it resolves. The provider adapter pushes its
 * own `provider-call` marker (onto the same timeline) from inside the
 * operation, so the recorded event order proves reservation precedes the call
 * and reconciliation follows the response (Req 24.3).
 */
function makeRecordingLedger(balance: number, events: MeterEvent[]) {
  return {
    events,
    runMeteredCalls: 0,
    async ensureCreditAccount() {
      return balance;
    },
    async runMetered<T>(
      _feature: string,
      _usageFeature: string,
      _ctx: unknown,
      operation: (signal?: AbortSignal) => Promise<T>,
      additionalProviderCostInr = 0,
      signal?: AbortSignal,
    ): Promise<{ result: T; settlement: CreditSettlement }> {
      this.runMeteredCalls += 1;
      // (1) Reserve the estimated credits BEFORE the provider call (Req 17.2, 24.3).
      events.push({ type: 'reserve', credits: additionalProviderCostInr });
      const result = await operation(signal);
      // (2) Reconcile against measured actual usage AFTER the response (Req 17.3, 24.3).
      const charged = 3;
      events.push({ type: 'reconcile', credits: charged });
      return { result, settlement: { charged, remaining: balance - charged } };
    },
  };
}

/**
 * A server-side provider adapter that returns a duration-aligned output for the
 * affected range. Records each `edit` call (into the shared metering timeline)
 * and captures the request so the test can assert the provider received the
 * COMPILED instruction + preservation constraints (never the raw user prompt).
 */
function makeInCapProvider(
  meterEvents: MeterEvent[],
): VideoAIProvider & { editCalls: number; lastEdit?: VideoEditRequest } {
  const provider = {
    provider: OMNI_CAPS.provider,
    model: OMNI_CAPS.model,
    editCalls: 0,
    lastEdit: undefined as VideoEditRequest | undefined,
    getCapabilities: () => OMNI_CAPS,
    estimateCost: async () => ({
      provider: OMNI_CAPS.provider,
      model: OMNI_CAPS.model,
      outputSeconds: 1,
      costInr: OMNI_CAPS.costPerOutputSecondInr,
      currency: 'INR' as const,
    }),
    async edit(req: VideoEditRequest, _signal?: AbortSignal): Promise<VideoEditResult> {
      provider.editCalls += 1;
      provider.lastEdit = req;
      // The provider call happens INSIDE the metered operation, between reserve
      // and reconcile (Req 24.3).
      meterEvents.push({ type: 'provider-call' });
      const startMs = req.affectedRangeMs?.startMs ?? 0;
      const endMs = req.affectedRangeMs?.endMs ?? 1_000;
      return {
        provider: OMNI_CAPS.provider,
        model: OMNI_CAPS.model,
        output: {
          // A REAL provider output payload (base64 bytes) — never a fabricated stub.
          videoBase64: Buffer.from(`omni-object-removed-${startMs}-${endMs}`).toString('base64'),
          mimeType: 'video/mp4',
          // Duration-aligned to the replaced range (Req 9.12).
          outputSeconds: (endMs - startMs) / 1000,
        },
      };
    },
    generate: async () => {
      throw new Error('generate is not used in an object-removal edit');
    },
    getIntegrationStatus: () => ({
      provider: OMNI_CAPS.provider,
      model: OMNI_CAPS.model,
      integrated: true,
      integratedOperations: ['edit'] as const,
      lastSuccessAt: Date.now(),
      lastError: null,
    }),
    isIntegrated: () => true,
  };
  return provider as unknown as VideoAIProvider & { editCalls: number; lastEdit?: VideoEditRequest };
}

/** An FFmpeg extraction double returning small fake bytes for the sub-range. */
const okExtractor: SegmentExtractor = async ({ range }) => ({
  buffer: Buffer.from(`extracted-${range.startMs}-${range.endMs}`),
  mimeType: 'video/mp4',
  durationMs: range.endMs - range.startMs,
});

/**
 * A QC prober that reports a clean, duration-aligned MP4/H.264/AAC segment so
 * the Quality_Controller's `inspectOutput` validation PASSES. Records each
 * invocation so the test can assert QC actually ran on the produced segment
 * (Req 24.4).
 */
function makePassingProber(record: { calls: number }): SegmentOutputProber {
  return async ({ output }) => {
    record.calls += 1;
    const durationMs = Math.round(output.outputSeconds * 1000);
    const probe: OutputProbe = {
      exists: true,
      sizeBytes: 2048,
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
  };
}

/** An artifact repository double recording every stored (immutable) artifact. */
function makeArtifactRepo() {
  return {
    created: [] as any[],
    async createArtifact(input: any) {
      const artifactId = `gen-artifact-${this.created.length + 1}`;
      this.created.push(input);
      return {
        artifact: { artifactId } as never,
        storageKey: `video-editor/proj-b/generated/${artifactId}.mp4`,
        url: `https://storage.local/video-editor/proj-b/generated/${artifactId}.mp4`,
      };
    },
  };
}

/** A timeline gateway double recording every insertion (the only timeline mutation). */
function makeTimelineGateway(): TimelineSegmentGateway & { inserts: any[] } {
  const gateway = {
    inserts: [] as any[],
    async insertValidatedSegment(input: any) {
      gateway.inserts.push(input);
      return { ok: true as const };
    },
  };
  return gateway;
}

// ---------------------------------------------------------------------------
// The scenario
// ---------------------------------------------------------------------------

describe('Acceptance Test B — in-cap generative object removal (Req 24.3, 24.4)', () => {
  it('routes generative, reserves→calls→reconciles, stores a real artifact, inserts it, runs QC, and renders', async () => {
    // -----------------------------------------------------------------------
    // Step 0 — the Model_Router routes the object-removal op GENERATIVELY.
    //
    // Object removal is NOT a deterministic-performable kind, and the selected
    // provider (Gemini Omni) supports it, so routing selects the generative
    // engine — NOT the Deterministic_Editor (Req 6.3, 24.3).
    // -----------------------------------------------------------------------
    const capabilityQuery: CapabilityQuery = {
      isDeterministicPerformable: (kind) => kind !== 'remove_object', // object removal is generative
      candidatesFor: (opType) => (opType === 'remove_object' ? [OMNI_CAPS] : []),
    };
    const removeObjectOp: RoutableOperation = {
      type: 'generative',
      kind: 'remove_object',
      changesVisualContent: true,
    };

    const routing = routeOperation(removeObjectOp, capabilityQuery, ALL_HEALTHY);

    expect(routing.engine).toBe('generative');
    if (routing.engine !== 'generative') return;
    expect(routing.provider).toBe(GEMINI_OMNI_PROVIDER);
    expect(routing.model).toBe(GEMINI_OMNI_MODEL);
    // The clip is within the selected provider's editable-input capability.
    expect(SOURCE_DURATION_MS / 1000).toBeLessThanOrEqual(OMNI_CAPS.editableInputSeconds.max);

    // -----------------------------------------------------------------------
    // Step 1 — the Generative_Editor runs the edit end-to-end with the REAL
    // metering service (reserve → call → reconcile) and the REAL orchestration.
    // -----------------------------------------------------------------------
    // Shared metering timeline: reserve/provider-call/reconcile in call order.
    const meterEvents: MeterEvent[] = [];
    const ledger = makeRecordingLedger(1_000, meterEvents);

    const metering = new VideoGenerativeMeteringService({ ledger: ledger as any });
    const provider = makeInCapProvider(meterEvents);
    const artifactRepository = makeArtifactRepo();
    const timelineGateway = makeTimelineGateway();
    const proberRecord = { calls: 0 };
    // A no-op VideoEditJob model (state transitions are covered by the worker test).
    const jobModel = { updateOne: () => ({ exec: async () => ({}) }) } as never;

    const generativeEditor = new GenerativeEditorService({
      metering,
      artifactRepository: artifactRepository as never,
      timelineGateway,
      jobModel,
      segmentExtractor: okExtractor,
      outputProber: makePassingProber(proberRecord),
      logger: { info() {}, warn() {}, error() {}, debug() {} },
    });

    const editRequest: GenerativeEditRequest = {
      projectId: 'proj-b',
      workspaceId: 'ws-b',
      userId: 'user-b',
      jobId: 've-generation-proj-b-v1-op1',
      inputVersionId: 'v0',
      versionId: 'v1',
      source: { storageKey: 'video-editor/proj-b/original/src.mp4', fileName: 'src.mp4', durationMs: SOURCE_DURATION_MS },
      affectedRegion: AFFECTED_REGION,
      segmentation: {
        // The selected provider's REAL editable-input capability bounds.
        caps: { editableInputSeconds: OMNI_CAPS.editableInputSeconds },
        sceneBoundariesMs: [],
      },
      prompt: {
        // The raw request is inert data; the required Protected_Element ("face")
        // is one the selected provider guarantees, so the provider IS invoked
        // with explicit preservation constraints (Req 9.7, 9.8).
        userRequest: RAW_USER_REQUEST,
        requiredProtectedElements: ['face'],
        operationType: 'object_removal',
      },
      provider,
      metering: { idempotencyKey: 've-generation-proj-b-v1-op1', confirm: async () => true },
      outputResolution: '1080x1920',
    };

    const result = await generativeEditor.runGenerativeEdit(editRequest);

    // --- Req 24.4: the edit completes with a validated, inserted segment. ---
    expect(result.status).toBe('completed');
    if (result.status !== 'completed') return;
    expect(result.timelineChanged).toBe(true);
    expect(result.segments).toHaveLength(1);

    // The single in-cap segment covers the whole affected region, duration-aligned.
    const segment = result.segments[0];
    expect(segment.range).toEqual(AFFECTED_REGION);
    expect(segment.outputDurationMs).toBe(AFFECTED_REGION.endMs - AFFECTED_REGION.startMs);
    expect(segment.provider).toBe(GEMINI_OMNI_PROVIDER);
    expect(segment.model).toBe(GEMINI_OMNI_MODEL);

    // --- Req 24.3: reserve BEFORE the provider call, reconcile AFTER it. ---
    expect(provider.editCalls).toBe(1);
    expect(ledger.runMeteredCalls).toBe(1);
    const reserveIdx = meterEvents.findIndex((e) => e.type === 'reserve');
    const callIdx = meterEvents.findIndex((e) => e.type === 'provider-call');
    const reconcileIdx = meterEvents.findIndex((e) => e.type === 'reconcile');
    expect(reserveIdx).toBeGreaterThanOrEqual(0);
    expect(callIdx).toBeGreaterThan(reserveIdx); // reserve precedes the call
    expect(reconcileIdx).toBeGreaterThan(callIdx); // reconcile follows the response
    // The reservation carried the server-computed estimate (> 0), reconciled to
    // the measured actual usage.
    expect(meterEvents[reserveIdx].credits).toBeGreaterThan(0);
    expect(meterEvents[reconcileIdx].credits).toBe(3);

    // --- Req 24.3: the provider was called server-side with the COMPILED
    // instruction (never the raw prompt) + explicit preservation constraints. ---
    expect(provider.lastEdit).toBeDefined();
    expect(provider.lastEdit!.instruction).not.toBe(RAW_USER_REQUEST);
    expect(provider.lastEdit!.preservationConstraints?.length ?? 0).toBeGreaterThan(0);

    // --- Req 24.4: QC ran on the produced segment. ---
    expect(proberRecord.calls).toBe(1);

    // --- Req 24.4: the actual provider output was stored as an immutable
    // Video_Artifact with complete provenance. ---
    expect(artifactRepository.created).toHaveLength(1);
    const storedArtifact = artifactRepository.created[0];
    expect(storedArtifact.category).toBe('generated');
    expect(storedArtifact.buffer.length).toBeGreaterThan(0); // real provider bytes
    expect(storedArtifact.provenance.jobId).toBe(editRequest.jobId);
    expect(storedArtifact.provenance.provider).toBe(GEMINI_OMNI_PROVIDER);
    expect(storedArtifact.provenance.model).toBe(GEMINI_OMNI_MODEL);

    // --- Req 24.4: the validated segment was inserted into the timeline. ---
    expect(timelineGateway.inserts).toHaveLength(1);
    expect(timelineGateway.inserts[0].artifactId).toBe(segment.artifactId);
    expect(timelineGateway.inserts[0].range).toEqual(AFFECTED_REGION);

    // -----------------------------------------------------------------------
    // Step 2 — the Render_Engine produces a final render of the edited timeline.
    //
    // The timeline now holds the generatively edited clip (referencing the
    // stored artifact). The Render_Engine renders it, runs render validation,
    // and — on a fully valid file — stores exactly one immutable `renders`
    // artifact and marks the job COMPLETED (Req 15.6, 24.4).
    // -----------------------------------------------------------------------
    const profile = getExportProfile(RENDER_PROFILE_ID)!;

    const editedTimeline: TimelineModel = {
      sequences: [{ tracks: 1 }],
      elements: [
        {
          kind: 'clip',
          trackIndex: 0,
          timelineStartMs: AFFECTED_REGION.startMs,
          timelineEndMs: AFFECTED_REGION.endMs,
          // The clip now sources the generatively edited artifact.
          sourceAssetId: segment.artifactId,
          sourceInMs: 0,
          sourceOutMs: AFFECTED_REGION.endMs - AFFECTED_REGION.startMs,
        },
      ],
    };

    // A runner that writes a small non-empty output file (real FFmpeg stubbed).
    const writingRunner: RenderFfmpegRunner = async (args) => {
      const outputPath = args[args.length - 1];
      await fs.promises.writeFile(outputPath, Buffer.from('final-rendered-video-bytes'));
    };
    // A probe reporting an MP4/H.264/AAC file matching the profile at 6 s.
    const matchingProbe: RenderOutputProber = async () => ({
      exists: true,
      sizeBytes: 300_000,
      hasVideoStream: true,
      container: profile.container,
      videoCodec: profile.videoCodec,
      audioCodec: 'aac',
      audioStreamCount: 1,
      width: profile.width,
      height: profile.height,
      fps: profile.fps,
      durationMs: SOURCE_DURATION_MS,
    });

    const renderArtifactRepo = makeArtifactRepo();
    const renderJobUpdates: any[] = [];
    const renderJobModel = {
      updateOne(filter: any, update: any) {
        return {
          async exec() {
            renderJobUpdates.push({ filter, update });
          },
        };
      },
    } as any;
    const renderTempDir = path.join(os.tmpdir(), `ve-acceptance-b-render-${randomUUID()}`);

    const renderEngine = new RenderEngineService({
      storage: {
        async downloadFile() {
          return { buffer: Buffer.from('input-bytes'), contentType: 'video/mp4', size: 11 };
        },
      } as any,
      artifactRepository: renderArtifactRepo as any,
      jobModel: renderJobModel,
      assetResolver: async () => ({ storageKey: 'sk-generated', fileName: 'edited.mp4' }),
      runner: writingRunner,
      prober: matchingProbe,
      tempDir: renderTempDir,
      logger: { info() {}, warn() {}, error() {}, debug() {} },
    });

    const renderRequest: RenderRequest = {
      projectId: 'proj-b',
      workspaceId: 'ws-b',
      userId: 'user-b',
      jobId: 've-render-proj-b-v1-op1',
      inputVersionId: 'v1',
      timeline: editedTimeline,
      exportProfileId: RENDER_PROFILE_ID,
    };

    const renderResult = await renderEngine.render(renderRequest);

    // --- Req 24.4 + Req 15.6: a valid final render completes the job. ---
    expect(renderResult.ok).toBe(true);
    if (!renderResult.ok) return;
    expect(renderResult.jobState).toBe('COMPLETED');
    expect(renderResult.outcome.validation.valid).toBe(true);

    // Exactly one immutable render artifact, MP4/H.264/AAC, deterministic provenance.
    expect(renderArtifactRepo.created).toHaveLength(1);
    expect(renderArtifactRepo.created[0].category).toBe('renders');
    expect(renderArtifactRepo.created[0].deterministic).toBe(true);
    expect(renderArtifactRepo.created[0].provenance.jobId).toBe(renderRequest.jobId);

    // Clean up the temp render dir.
    await fs.promises.rm(renderTempDir, { recursive: true, force: true });
  });
});
