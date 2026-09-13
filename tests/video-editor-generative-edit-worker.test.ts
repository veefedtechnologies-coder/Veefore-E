/**
 * Unit tests for the async `video-generation` worker processor
 * (`server/features/video-editor/services/generative-edit-worker.ts`, task 17.8).
 *
 * These verify the wiring contract of Req 18.1: the worker reconstructs the
 * generative edit from the enqueued job payload, drives the `Video_Edit_Job`
 * state machine around the Generative_Editor, and settles the job to the correct
 * terminal state from the discriminated `GenerativeEditResult` — without Redis,
 * MongoDB, FFmpeg, or a real provider. All collaborators are injected as fakes.
 */

import { describe, it, expect, vi } from 'vitest';

import {
  runGenerativeEditJob,
  parseGenerativeEditPayload,
  resolveVideoProvider,
  GEN_ERR_INVALID_PAYLOAD,
  GEN_ERR_PROVIDER_UNRESOLVED,
  GEN_ERR_CAPABILITY_UNKNOWN,
  GEN_ERR_INSUFFICIENT_CREDITS,
  type GenerativeEditJobPayload,
  type GenerativeEditWorkerDeps,
} from '../server/features/video-editor/services/generative-edit-worker';
import type { GenerativeEditResult } from '../server/features/video-editor/services/generative-editor.service';
import { SEED_VIDEO_MODEL_CAPABILITIES } from '../server/features/video-editor/services/provider-capability-seed';
import { videoEditorJobId } from '../server/queues/videoEditorQueues';
import {
  GEMINI_OMNI_PROVIDER,
  GEMINI_OMNI_MODEL,
} from '../server/features/video-editor/services/providers/gemini-omni-adapter';
import { VEO_PROVIDER, VEO_MODEL } from '../server/features/video-editor/services/providers/veo-adapter';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const OMNI_CAPS = SEED_VIDEO_MODEL_CAPABILITIES.find(
  (c) => c.provider === GEMINI_OMNI_PROVIDER && c.model === GEMINI_OMNI_MODEL,
)!;

function makePayload(overrides: Partial<GenerativeEditJobPayload> = {}): GenerativeEditJobPayload {
  return {
    kind: 'generative-edit',
    projectId: 'vp-1',
    workspaceId: 'ws-1',
    userId: 'user-1',
    inputVersionId: 'v1',
    versionId: 'v1',
    operationId: 'op-1',
    source: { storageKey: 'video-editor/vp-1/original/src.mp4', fileName: 'src.mp4', durationMs: 8000 },
    affectedRegion: { startMs: 0, endMs: 4000 },
    provider: { provider: GEMINI_OMNI_PROVIDER, model: GEMINI_OMNI_MODEL },
    prompt: { userRequest: 'remove the person in the background', requiredProtectedElements: [] },
    ...overrides,
  };
}

/** A fake Job_System recording lifecycle calls. */
function makeJobSystem() {
  return {
    transitionTo: vi.fn(async (_jobId: string, _to: string) => ({}) as any),
    recordStageComplete: vi.fn(async (_jobId: string, _stage: string) => ({}) as any),
    completeJob: vi.fn(async (_jobId: string, _ids?: string[]) => ({}) as any),
    failJob: vi.fn(async (_jobId: string, _code: string) => ({}) as any),
    cancelJob: vi.fn(async (_jobId: string) => ({}) as any),
    getAbortSignal: vi.fn((_jobId: string) => undefined as AbortSignal | undefined),
  };
}

function makeDeps(
  result: GenerativeEditResult | (() => Promise<GenerativeEditResult>),
  overrides: Partial<GenerativeEditWorkerDeps> = {},
): { deps: GenerativeEditWorkerDeps; jobSystem: ReturnType<typeof makeJobSystem>; runEdit: ReturnType<typeof vi.fn> } {
  const jobSystem = makeJobSystem();
  const runEdit = vi.fn(async () => (typeof result === 'function' ? result() : result));
  const deps: GenerativeEditWorkerDeps = {
    jobSystem: jobSystem as any,
    registry: {
      lookup: vi.fn(async () => ({ supported: true as const, caps: OMNI_CAPS })),
    },
    generativeEditor: { runGenerativeEdit: runEdit as any },
    resolveProvider: () => ({ getCapabilities: () => OMNI_CAPS }) as any,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    ...overrides,
  };
  return { deps, jobSystem, runEdit };
}

const JOB_ID = videoEditorJobId('generation', { projectId: 'vp-1', versionId: 'v1', opId: 'op-1' });

// ---------------------------------------------------------------------------
// resolveVideoProvider
// ---------------------------------------------------------------------------

describe('resolveVideoProvider', () => {
  it('resolves the seeded Gemini Omni and Veo provider identities', () => {
    expect(resolveVideoProvider(GEMINI_OMNI_PROVIDER, GEMINI_OMNI_MODEL)).not.toBeNull();
    expect(resolveVideoProvider(VEO_PROVIDER, VEO_MODEL)).not.toBeNull();
  });

  it('returns null for an unknown provider/model (No-Mock — never fabricated)', () => {
    expect(resolveVideoProvider('unknown', 'x')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseGenerativeEditPayload
// ---------------------------------------------------------------------------

describe('parseGenerativeEditPayload', () => {
  it('accepts a well-formed payload', () => {
    expect(parseGenerativeEditPayload(makePayload())).not.toBeNull();
  });

  it('rejects a payload with the wrong discriminant, a missing field, or a bad range', () => {
    expect(parseGenerativeEditPayload({ ...makePayload(), kind: 'nope' })).toBeNull();
    expect(parseGenerativeEditPayload({ ...makePayload(), projectId: '' })).toBeNull();
    expect(parseGenerativeEditPayload({ ...makePayload(), affectedRegion: { startMs: 0 } })).toBeNull();
    expect(parseGenerativeEditPayload(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// runGenerativeEditJob — lifecycle wiring (Req 18.1, 18.2, 18.4)
// ---------------------------------------------------------------------------

describe('runGenerativeEditJob', () => {
  it('enters EDITING before the edit, then completes the job with the segment artifacts on success', async () => {
    const result: GenerativeEditResult = {
      status: 'completed',
      timelineChanged: true,
      segments: [
        {
          range: { startMs: 0, endMs: 4000 },
          artifactId: 'artifact-1',
          storageKey: 'k',
          provider: GEMINI_OMNI_PROVIDER,
          model: GEMINI_OMNI_MODEL,
          outputDurationMs: 4000,
        },
      ],
    };
    const { deps, jobSystem, runEdit } = makeDeps(result);

    const outcome = await runGenerativeEditJob(makePayload(), deps);

    // EDITING transition happened before the edit ran (Req 18.2).
    expect(jobSystem.transitionTo).toHaveBeenCalledWith(JOB_ID, 'EDITING');
    expect(runEdit).toHaveBeenCalledTimes(1);
    const editArg = runEdit.mock.calls[0][0];
    expect(editArg.jobId).toBe(JOB_ID);
    // The provider receives the request built from the payload + resolved caps.
    expect(editArg.segmentation.caps.editableInputSeconds).toEqual(OMNI_CAPS.editableInputSeconds);

    // Stage recorded (progress is stage-derived, Req 18.4) then job completed.
    expect(jobSystem.recordStageComplete).toHaveBeenCalledWith(JOB_ID, 'EDITING');
    expect(jobSystem.completeJob).toHaveBeenCalledWith(JOB_ID, ['artifact-1']);
    expect(outcome).toEqual({ jobId: JOB_ID, state: 'COMPLETED', segments: 1 });
  });

  it('cancels the job when the edit is cancelled (no deduction, timeline unchanged)', async () => {
    const { deps, jobSystem } = makeDeps({ status: 'cancelled', cause: 'aborted' });
    const outcome = await runGenerativeEditJob(makePayload(), deps);
    expect(jobSystem.cancelJob).toHaveBeenCalledWith(JOB_ID);
    expect(jobSystem.completeJob).not.toHaveBeenCalled();
    expect(outcome.state).toBe('CANCELLED');
  });

  it('fails the job with an insufficient-credits code when blocked (Req 17.9)', async () => {
    const { deps, jobSystem } = makeDeps({
      status: 'blocked',
      reason: 'not enough credits',
      required: 10,
      remaining: 2,
      upgradePath: { type: 'upgrade_or_add_credits', message: 'x', actions: ['add_credits'] },
    });
    const outcome = await runGenerativeEditJob(makePayload(), deps);
    expect(jobSystem.failJob).toHaveBeenCalledWith(JOB_ID, GEN_ERR_INSUFFICIENT_CREDITS);
    expect(outcome).toMatchObject({ state: 'FAILED', errorCode: GEN_ERR_INSUFFICIENT_CREDITS });
  });

  it('fails the job when the selected provider cannot be resolved (No-Mock)', async () => {
    const { deps, jobSystem, runEdit } = makeDeps(
      { status: 'completed', timelineChanged: true, segments: [] },
      { resolveProvider: () => null },
    );
    const outcome = await runGenerativeEditJob(makePayload(), deps);
    expect(jobSystem.failJob).toHaveBeenCalledWith(JOB_ID, GEN_ERR_PROVIDER_UNRESOLVED);
    // The edit is never attempted and the job never enters EDITING.
    expect(runEdit).not.toHaveBeenCalled();
    expect(jobSystem.transitionTo).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ state: 'FAILED', errorCode: GEN_ERR_PROVIDER_UNRESOLVED });
  });

  it('fails the job when no capability metadata exists for the provider (Req 7.4)', async () => {
    const { deps, jobSystem, runEdit } = makeDeps(
      { status: 'completed', timelineChanged: true, segments: [] },
      { registry: { lookup: vi.fn(async () => ({ supported: false as const })) } },
    );
    const outcome = await runGenerativeEditJob(makePayload(), deps);
    expect(jobSystem.failJob).toHaveBeenCalledWith(JOB_ID, GEN_ERR_CAPABILITY_UNKNOWN);
    expect(runEdit).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ state: 'FAILED', errorCode: GEN_ERR_CAPABILITY_UNKNOWN });
  });

  it('throws on a missing/invalid payload rather than fabricating success (No-Mock)', async () => {
    const { deps } = makeDeps({ status: 'completed', timelineChanged: true, segments: [] });
    await expect(runGenerativeEditJob({ kind: 'nope' }, deps)).rejects.toThrow(GEN_ERR_INVALID_PAYLOAD);
  });
});
