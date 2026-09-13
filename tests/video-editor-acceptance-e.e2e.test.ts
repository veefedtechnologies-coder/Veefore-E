/**
 * Acceptance Test E — insufficient credits (task 24.5).
 *
 * Framework: vitest (matching the repo E2E/service test stack).
 *
 * This is an END-TO-END acceptance scenario that drives the REAL pre-execution
 * credit gate exactly as the design's generative-edit flow describes. It uses
 * the production services already built for the generative pipeline —
 * Model_Router (routing), the VideoGenerativeMeteringService (gate → confirm →
 * runMetered), and the Generative_Editor orchestration (extract → segment →
 * meter → QC → insert) — and injects in-memory fakes only for the process
 * boundaries (the credit ledger, a provider adapter, FFmpeg extraction, storage,
 * the timeline gateway, and the job model). No real Redis, MongoDB, provider, or
 * FFmpeg binary is required, matching Acceptance Tests A and B.
 *
 * Scenario (Req 24.7 — Acceptance Test E):
 *   A user whose reserved estimate EXCEEDS their available credit balance
 *   attempts a generative edit (background object removal, in-capability). The
 *   Video_Editor MUST:
 *
 *     - NOT call the provider (the gate blocks BEFORE any provider communication);
 *     - NOT present a success result (the edit resolves to a `blocked` outcome,
 *       never `completed`);
 *     - present an actionable message containing a selectable upgrade or
 *       add-credit action; and
 *     - NOT deduct credits (the server-side balance is unchanged, no reservation
 *       is made, and the metered-execution path is never entered).
 *
 * We prove "nothing changed" three ways: a provider-`edit` spy and a
 * `runMetered` spy — both wired to the test so ANY use would be observed — remain
 * uninvoked; the artifact repository stores nothing; and the timeline gateway
 * records no insertion.
 *
 * **Validates: Requirements 24.7**
 */

import { describe, it, expect } from 'vitest';

// --- Model_Router (routing decision) ---------------------------------------
import {
  routeOperation,
  ALL_HEALTHY,
  type CapabilityQuery,
  type RoutableOperation,
} from '../server/features/video-editor/services/model-router.logic';

// --- Metering (gate → confirm → runMetered) --------------------------------
import { VideoGenerativeMeteringService } from '../server/features/video-editor/services/generative-metering.service';

// --- Generative_Editor orchestration ---------------------------------------
import {
  GenerativeEditorService,
  type GenerativeEditRequest,
  type SegmentExtractor,
  type SegmentOutputProber,
  type TimelineSegmentGateway,
} from '../server/features/video-editor/services/generative-editor.service';

// --- The authoritative reservation estimate (the ceiling the gate checks) ---
import {
  reservationEstimate,
  creditRuleFor,
} from '../server/features/video-editor/services/credit-reconciliation.logic';
import { VIDEO_GENERATIVE_CREDIT_FEATURE } from '../server/features/video-editor/services/generative-metering.service';

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
 * A 6 s affected region — strictly WITHIN the provider's 8 s editable-input
 * capability, so segmentation yields a single in-cap sub-range. The edit is
 * otherwise a perfectly valid, in-capability generative edit; the ONLY reason it
 * must not proceed is that the user cannot afford the reserved estimate.
 */
const AFFECTED_REGION = { startMs: 0, endMs: 6_000 };
const SOURCE_DURATION_MS = 6_000;

const RAW_USER_REQUEST =
  'remove the person walking in the background but keep everything else unchanged';

/**
 * The server-authoritative reservation estimate (the ceiling) the gate checks a
 * balance against, read from the single-source `CREDIT_MODEL`. The scenario's
 * balance is set strictly below this so the gate blocks (Req 17.9, 24.7).
 */
const RESERVATION_ESTIMATE = reservationEstimate(creditRuleFor(VIDEO_GENERATIVE_CREDIT_FEATURE));

/** A balance that cannot cover the reserved estimate (Req 24.7). */
const INSUFFICIENT_BALANCE = Math.max(1, Math.floor(RESERVATION_ESTIMATE / 2));

// ---------------------------------------------------------------------------
// Injected doubles — process boundaries only (No-Mock domain logic)
// ---------------------------------------------------------------------------

/**
 * A ledger fake whose server-side balance CANNOT cover the reserved estimate.
 * `ensureCreditAccount` returns the authoritative (server-side) balance — a
 * client-supplied balance is never trusted (Req 17.6). `runMetered` is a spy
 * that MUST NOT run: reaching it would mean a reservation/charge was attempted
 * despite the block, so it throws to fail the test loudly if ever invoked
 * (Req 24.7 — no deduction).
 */
function makeInsufficientLedger(balance: number) {
  return {
    balance,
    ensureCreditAccountCalls: 0,
    runMeteredCalls: 0,
    async ensureCreditAccount(_userId: string) {
      this.ensureCreditAccountCalls += 1;
      return this.balance;
    },
    async runMetered() {
      this.runMeteredCalls += 1;
      throw new Error(
        'runMetered must NEVER be called when credits are insufficient — the gate blocks before any reservation or provider call (Req 24.7).',
      );
    },
  };
}

/**
 * A server-side provider adapter whose `edit`/`generate` MUST NOT be called.
 * Any invocation throws, so the test observes a real violation of Req 24.7 if
 * the pipeline ever reaches the provider despite the block. `editCalls` also
 * lets the assertions confirm the count stayed at zero.
 */
function makeUncalledProvider(): VideoAIProvider & { editCalls: number } {
  const provider = {
    provider: OMNI_CAPS.provider,
    model: OMNI_CAPS.model,
    editCalls: 0,
    getCapabilities: () => OMNI_CAPS,
    estimateCost: async () => ({
      provider: OMNI_CAPS.provider,
      model: OMNI_CAPS.model,
      outputSeconds: 6,
      costInr: OMNI_CAPS.costPerOutputSecondInr * 6,
      currency: 'INR' as const,
    }),
    async edit(_req: VideoEditRequest, _signal?: AbortSignal): Promise<VideoEditResult> {
      provider.editCalls += 1;
      throw new Error(
        'The provider must NEVER be called when credits are insufficient (Req 24.7).',
      );
    },
    generate: async () => {
      throw new Error('The provider must NEVER be called when credits are insufficient (Req 24.7).');
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
  return provider as unknown as VideoAIProvider & { editCalls: number };
}

/**
 * An FFmpeg extraction double that MUST NOT be called — the credit gate runs
 * inside the metered operation, but extraction happens for each sub-range before
 * metering, so we still record calls to prove the whole edit stops at the gate
 * without producing any provider input. (Extraction may legitimately run before
 * the gate in the orchestration; we therefore only assert the provider/ledger
 * were never reached and no side effects occurred, not that extraction never
 * ran.)
 */
function makeRecordingExtractor(): SegmentExtractor & { calls: number } {
  const fn = (async ({ range }: { range: { startMs: number; endMs: number } }) => {
    (fn as unknown as { calls: number }).calls += 1;
    return {
      buffer: Buffer.from(`extracted-${range.startMs}-${range.endMs}`),
      mimeType: 'video/mp4',
      durationMs: range.endMs - range.startMs,
    };
  }) as SegmentExtractor & { calls: number };
  fn.calls = 0;
  return fn;
}

/** A QC prober that MUST NOT be reached (no provider output can exist). */
function makeUnreachableProber(): SegmentOutputProber & { calls: number } {
  const fn = (async () => {
    (fn as unknown as { calls: number }).calls += 1;
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
      durationMs: SOURCE_DURATION_MS,
    };
    const metrics: QualityMetrics = {
      longestBlackRunMs: 0,
      longestFrozenRunMs: 0,
      audioExpected: true,
      audioPresent: true,
      audioSilentFraction: 0,
      maxArtifactAreaFraction: 0,
      measuredDurationMs: SOURCE_DURATION_MS,
    };
    return { probe, metrics };
  }) as SegmentOutputProber & { calls: number };
  fn.calls = 0;
  return fn;
}

/** An artifact repository double — nothing must be stored on a blocked edit. */
function makeArtifactRepo() {
  return {
    created: [] as any[],
    async createArtifact(input: any) {
      this.created.push(input);
      return {
        artifact: { artifactId: `gen-artifact-${this.created.length}` } as never,
        storageKey: `video-editor/proj-e/generated/gen-artifact-${this.created.length}.mp4`,
        url: `https://storage.local/video-editor/proj-e/generated/gen-artifact-${this.created.length}.mp4`,
      };
    },
  };
}

/** A timeline gateway double — no insertion must occur on a blocked edit. */
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

describe('Acceptance Test E — insufficient credits (Req 24.7)', () => {
  it('blocks the generative edit before any provider call, surfaces an upgrade/add-credit action, and deducts nothing', async () => {
    // -----------------------------------------------------------------------
    // Step 0 — the Model_Router routes the object-removal op GENERATIVELY.
    //
    // The edit itself is a valid, in-capability generative operation — the user
    // is genuinely "attempting a generative edit" (Req 24.7). Routing proves the
    // request would go to the provider were the credits sufficient.
    // -----------------------------------------------------------------------
    const capabilityQuery: CapabilityQuery = {
      isDeterministicPerformable: (kind) => kind !== 'remove_object',
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
    // The clip is within the selected provider's editable-input capability, so
    // the ONLY reason the edit will not proceed is the insufficient balance.
    expect(SOURCE_DURATION_MS / 1000).toBeLessThanOrEqual(OMNI_CAPS.editableInputSeconds.max);

    // -----------------------------------------------------------------------
    // Step 1 — the Generative_Editor runs the edit with the REAL metering
    // service against a server-side balance that cannot cover the reservation.
    // -----------------------------------------------------------------------
    // Sanity: the scenario balance genuinely cannot cover the reserved estimate.
    expect(INSUFFICIENT_BALANCE).toBeLessThan(RESERVATION_ESTIMATE);

    const ledger = makeInsufficientLedger(INSUFFICIENT_BALANCE);
    const metering = new VideoGenerativeMeteringService({ ledger: ledger as any });
    const provider = makeUncalledProvider();
    const artifactRepository = makeArtifactRepo();
    const timelineGateway = makeTimelineGateway();
    const extractor = makeRecordingExtractor();
    const prober = makeUnreachableProber();
    // A no-op VideoEditJob model (state transitions are covered elsewhere).
    const jobModel = { updateOne: () => ({ exec: async () => ({}) }) } as never;

    // A confirmation callback that MUST NOT be reached — the affordability gate
    // runs BEFORE confirmation, so an insufficient balance blocks without ever
    // presenting the estimate for confirmation.
    let confirmCalls = 0;
    const confirm = async () => {
      confirmCalls += 1;
      throw new Error('Confirmation must not be requested when credits are insufficient (Req 24.7).');
    };

    const generativeEditor = new GenerativeEditorService({
      metering,
      artifactRepository: artifactRepository as never,
      timelineGateway,
      jobModel,
      segmentExtractor: extractor,
      outputProber: prober,
      logger: { info() {}, warn() {}, error() {}, debug() {} },
    });

    const editRequest: GenerativeEditRequest = {
      projectId: 'proj-e',
      workspaceId: 'ws-e',
      userId: 'user-e',
      jobId: 've-generation-proj-e-v1-op1',
      inputVersionId: 'v0',
      versionId: 'v1',
      source: {
        storageKey: 'video-editor/proj-e/original/src.mp4',
        fileName: 'src.mp4',
        durationMs: SOURCE_DURATION_MS,
      },
      affectedRegion: AFFECTED_REGION,
      segmentation: {
        caps: { editableInputSeconds: OMNI_CAPS.editableInputSeconds },
        sceneBoundariesMs: [],
      },
      prompt: {
        userRequest: RAW_USER_REQUEST,
        requiredProtectedElements: ['face'],
        operationType: 'object_removal',
      },
      provider,
      metering: { idempotencyKey: 've-generation-proj-e-v1-op1', confirm },
      outputResolution: '1080x1920',
    };

    const result = await generativeEditor.runGenerativeEdit(editRequest);

    // -----------------------------------------------------------------------
    // Req 24.7 — the edit is BLOCKED, not completed.
    // -----------------------------------------------------------------------
    expect(result.status).toBe('blocked');
    if (result.status !== 'blocked') return;

    // No success result of any kind is presented.
    expect(result.status).not.toBe('completed');

    // -----------------------------------------------------------------------
    // Req 24.7 — an actionable message with a SELECTABLE upgrade or add-credit
    // action is surfaced.
    // -----------------------------------------------------------------------
    expect(result.reason).toBeTruthy();
    expect(typeof result.reason).toBe('string');
    expect(result.upgradePath).toBeDefined();
    expect(result.upgradePath.type).toBe('upgrade_or_add_credits');
    expect(result.upgradePath.message).toBeTruthy();
    // The path offers concrete, selectable actions the UI can render.
    expect(result.upgradePath.actions).toEqual(
      expect.arrayContaining(['upgrade_plan', 'add_credits']),
    );
    // The block reports the server-authoritative required/remaining figures.
    expect(result.required).toBe(RESERVATION_ESTIMATE);
    expect(result.remaining).toBe(INSUFFICIENT_BALANCE);

    // -----------------------------------------------------------------------
    // Req 24.7 — the provider was NEVER called.
    // -----------------------------------------------------------------------
    expect(provider.editCalls).toBe(0);
    // The metered-execution path (reserve → call → reconcile) was never entered,
    // so no reservation and no charge ever occurred.
    expect(ledger.runMeteredCalls).toBe(0);
    // The gate was evaluated against the SERVER-side balance (Req 17.6).
    expect(ledger.ensureCreditAccountCalls).toBeGreaterThan(0);

    // -----------------------------------------------------------------------
    // Req 24.7 — nothing was deducted and no state changed.
    // -----------------------------------------------------------------------
    // The server-side balance is exactly as it was before the attempt.
    expect(ledger.balance).toBe(INSUFFICIENT_BALANCE);
    // No provider output was stored as an artifact.
    expect(artifactRepository.created).toHaveLength(0);
    // The timeline was left untouched — no validated segment was inserted.
    expect(timelineGateway.inserts).toHaveLength(0);
    // QC never ran (there is no provider output to inspect).
    expect(prober.calls).toBe(0);
    // Confirmation was never requested — the gate blocked first.
    expect(confirmCalls).toBe(0);
  });

  it('blocks even a zero-cost edit when the balance is zero, with no provider call and no deduction (Req 24.7)', async () => {
    // Req 17.9 / 24.7 edge: a user with ZERO credits is blocked even for a
    // zero-cost edit. This proves the gate is not merely a numeric ≥ comparison
    // that a free edit could slip past.
    const ledger = makeInsufficientLedger(0);
    const metering = new VideoGenerativeMeteringService({ ledger: ledger as any });
    const provider = makeUncalledProvider();
    const artifactRepository = makeArtifactRepo();
    const timelineGateway = makeTimelineGateway();

    const generativeEditor = new GenerativeEditorService({
      metering,
      artifactRepository: artifactRepository as never,
      timelineGateway,
      jobModel: { updateOne: () => ({ exec: async () => ({}) }) } as never,
      segmentExtractor: makeRecordingExtractor(),
      outputProber: makeUnreachableProber(),
      logger: { info() {}, warn() {}, error() {}, debug() {} },
    });

    const result = await generativeEditor.runGenerativeEdit({
      projectId: 'proj-e',
      workspaceId: 'ws-e',
      userId: 'user-e-zero',
      jobId: 've-generation-proj-e-zero-v1-op1',
      inputVersionId: 'v0',
      versionId: 'v1',
      source: {
        storageKey: 'video-editor/proj-e/original/src.mp4',
        fileName: 'src.mp4',
        durationMs: SOURCE_DURATION_MS,
      },
      affectedRegion: AFFECTED_REGION,
      segmentation: {
        caps: { editableInputSeconds: OMNI_CAPS.editableInputSeconds },
        sceneBoundariesMs: [],
      },
      prompt: {
        userRequest: RAW_USER_REQUEST,
        requiredProtectedElements: ['face'],
        operationType: 'object_removal',
      },
      provider,
      // Flag the edit zero-cost: a zero balance must STILL block (Req 17.9).
      metering: { idempotencyKey: 've-generation-proj-e-zero-v1-op1', isZeroCostEdit: true },
      outputResolution: '1080x1920',
    });

    expect(result.status).toBe('blocked');
    if (result.status !== 'blocked') return;
    expect(result.upgradePath.actions).toEqual(
      expect.arrayContaining(['upgrade_plan', 'add_credits']),
    );
    // Nothing was called, stored, inserted, or deducted.
    expect(provider.editCalls).toBe(0);
    expect(ledger.runMeteredCalls).toBe(0);
    expect(ledger.balance).toBe(0);
    expect(artifactRepository.created).toHaveLength(0);
    expect(timelineGateway.inserts).toHaveLength(0);
  });
});
