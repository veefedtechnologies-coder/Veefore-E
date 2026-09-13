/**
 * Generative-edit worker processor (task 17.8, Req 18.1).
 *
 * This is the asynchronous execution shell that runs a generative visual edit on
 * the `video-generation` BullMQ queue. The edits endpoint (task 17.8) routes a
 * generative operation through the Model_Router and enqueues a
 * `Video_Edit_Job` with the serializable {@link GenerativeEditJobPayload}
 * context; this module is what the `videoGenerationWorker` invokes to run that
 * job asynchronously so the initiating HTTP request never blocks (Req 18.1).
 *
 * The processor owns NO editing rules of its own — every decision belongs to the
 * `Generative_Editor` orchestration service (task 17.6) and its pure cores
 * (segmentation, prompt compilation, quality control, metering). This module
 * only:
 *
 *   1. Reconstructs the `GenerativeEditRequest` from the persisted job payload,
 *      resolving the Model_Router-selected provider adapter and its
 *      editable-input capability bounds from the Provider_Capability_Registry
 *      (never hardcoded — Req 7.3).
 *   2. Drives the `Video_Edit_Job` lifecycle around the edit through the pure,
 *      single-valued, terminal-absorbing state machine (Req 18.2): QUEUED →
 *      EDITING before the edit, then a terminal outcome derived from the
 *      discriminated `GenerativeEditResult` — COMPLETED on success (recording the
 *      EDITING stage so progress is stage-derived, Req 18.4), CANCELLED on a
 *      confirmation-timeout/decline/abort, or FAILED with a specific error code
 *      on every other non-completed outcome.
 *
 * Per the No-Mock rule (Req 23) it never fabricates success or progress: a
 * missing/invalid payload, an unresolvable provider, or missing capability
 * metadata fails the job loudly with an actionable error code.
 *
 * Every collaborator is injectable so the processor can be exercised without
 * Redis, MongoDB, FFmpeg, or a provider — matching the service conventions in
 * this feature.
 */

import { logger as defaultLogger } from '../../../config/logger';
import { videoEditorJobId } from '../../../queues/videoEditorQueues';

import {
  getJobSystemService,
  type JobSystemService,
} from './job-system.service';
import {
  getProviderCapabilityRegistry,
  type ProviderCapabilityRegistryService,
} from './provider-capability-registry.service';
import {
  GenerativeEditorService,
  type GenerativeEditRequest,
  type GenerativeEditResult,
} from './generative-editor.service';
import type { ProtectedElement } from './intent-extraction.logic';
import type { TimeRangeMs } from './audio-analysis.logic';
import type { VideoAIProvider } from './providers/video-ai-provider';
import {
  GeminiOmniAdapter,
  GEMINI_OMNI_PROVIDER,
  GEMINI_OMNI_MODEL,
} from './providers/gemini-omni-adapter';
import { VeoAdapter, VEO_PROVIDER, VEO_MODEL } from './providers/veo-adapter';

// ---------------------------------------------------------------------------
// Error codes recorded on a FAILED job (Req 18.9, No-Mock Req 23)
// ---------------------------------------------------------------------------

/** The job payload was missing or structurally invalid. */
export const GEN_ERR_INVALID_PAYLOAD = 'GENERATIVE_INVALID_PAYLOAD';
/** The Model_Router-selected provider/model could not be resolved to an adapter. */
export const GEN_ERR_PROVIDER_UNRESOLVED = 'GENERATIVE_PROVIDER_UNRESOLVED';
/** No capability metadata exists for the selected provider/model (Req 7.4). */
export const GEN_ERR_CAPABILITY_UNKNOWN = 'GENERATIVE_CAPABILITY_UNKNOWN';
/** The affected region could not be segmented (malformed request, Req 9.1). */
export const GEN_ERR_INVALID_INPUT = 'GENERATIVE_INVALID_INPUT';
/** The region exceeds capability and cannot be split — reroute needed (Req 9.6). */
export const GEN_ERR_REROUTE_REQUIRED = 'GENERATIVE_REROUTE_REQUIRED';
/** A required Protected_Element could not be guaranteed and no reroute existed (Req 9.9, 9.10). */
export const GEN_ERR_PROTECTED_ELEMENT = 'GENERATIVE_PROTECTED_ELEMENT_UNGUARANTEED';
/** Insufficient credits blocked the provider call (Req 17.9). */
export const GEN_ERR_INSUFFICIENT_CREDITS = 'GENERATIVE_INSUFFICIENT_CREDITS';
/** Extraction of an affected sub-range failed (Req 9.13) — set by the editor. */
export const GEN_ERR_EXTRACTION_FAILED = 'GENERATIVE_EXTRACTION_FAILED';
/** A produced segment failed quality control (Req 9.14) — set by the editor. */
export const GEN_ERR_QUALITY_FAILED = 'QUALITY_CONTROL_FAILED';

// ---------------------------------------------------------------------------
// Job payload (serialized onto the BullMQ job data — small metadata only)
// ---------------------------------------------------------------------------

/** The immutable source the edit reads from (bytes are fetched from storage). */
export interface GenerativeEditJobSource {
  /** Storage key of the immutable Video_Source bytes to read (Req 3.6, 8.4). */
  storageKey: string;
  /** Original source filename (used to derive temp file extensions). */
  fileName: string;
  /** Known source duration in ms (optional; for provenance/bounds). */
  durationMs?: number;
}

/** The Model_Router-selected provider/model for the edit (Req 6.6). */
export interface GenerativeEditJobProvider {
  provider: string;
  model: string;
}

/** Prompt-compilation inputs (Req 9.7–9.10). */
export interface GenerativeEditJobPrompt {
  /** The user's raw request — treated as inert data, never as commands (Req 9.7). */
  userRequest: string;
  /** Protected_Elements the user marked as required (Req 9.8). */
  requiredProtectedElements: ProtectedElement[];
  /** Optional operation type describing the task (e.g. 'remove_object'). */
  operationType?: string | null;
  /** Optional editing-style hint. */
  editingStyle?: string | null;
}

/** Segmentation inputs (Req 9.1–9.6); caps are resolved from the registry. */
export interface GenerativeEditJobSegmentation {
  /** Detected scene-boundary timestamps (ms) — the only legal cut points (Req 9.3). */
  sceneBoundariesMs?: number[];
  /** Ranges where a subject is continuously tracked — no cut inside (Req 9.4). */
  trackedSubjects?: TimeRangeMs[];
  /** Continuous audio utterances — no cut inside (Req 9.4). */
  utterances?: TimeRangeMs[];
  /** Optional candidate source ranges classified by overlap (Req 9.1). */
  candidateRanges?: TimeRangeMs[];
}

/**
 * The serializable context carried on the `video-generation` job so the worker
 * can reconstruct the full {@link GenerativeEditRequest}. It holds only small
 * metadata — the source bytes are fetched from storage by key inside the editor,
 * never carried through Redis.
 */
export interface GenerativeEditJobPayload {
  /** Discriminant so a worker can validate the payload shape. */
  kind: 'generative-edit';
  projectId: string;
  workspaceId: string;
  userId: string;
  /** Input Video_Version this edit derives from (provenance + lineage). */
  inputVersionId: string;
  /** Target Video_Version whose timeline receives the validated segments. */
  versionId: string;
  /** The originating operation id (part of the deterministic job id). */
  operationId: string;
  source: GenerativeEditJobSource;
  /** The bounded region the generative edit affects (Req 9.1). */
  affectedRegion: TimeRangeMs;
  provider: GenerativeEditJobProvider;
  prompt: GenerativeEditJobPrompt;
  segmentation?: GenerativeEditJobSegmentation;
  /** Requested output resolution (e.g. '1080x1920'), passed to the provider. */
  outputResolution?: string;
  /** Track index the validated replacement clips are placed on (default 0). */
  timelineTrackIndex?: number;
  /** The credit reservation idempotency key this job's provider work is metered under. */
  creditIdempotencyKey?: string;
  /** True when the requested edit is zero-cost (affects zero-balance gating, Req 17.9). */
  isZeroCostEdit?: boolean;
}

// ---------------------------------------------------------------------------
// Provider resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a Model_Router-selected `provider/model` pair to a concrete
 * {@link VideoAIProvider} adapter. Returns `null` for an unknown pair so the
 * worker can fail the job explicitly rather than fabricate a provider (No-Mock,
 * Req 23). The set mirrors the seeded capability records (task 2.3).
 */
export function resolveVideoProvider(provider: string, model: string): VideoAIProvider | null {
  if (provider === GEMINI_OMNI_PROVIDER && model === GEMINI_OMNI_MODEL) {
    return new GeminiOmniAdapter();
  }
  if (provider === VEO_PROVIDER && model === VEO_MODEL) {
    return new VeoAdapter();
  }
  return null;
}

// ---------------------------------------------------------------------------
// Injectable dependencies
// ---------------------------------------------------------------------------

/** The Job_System surface the worker drives (Req 18.2, 18.4). */
export type GenerativeEditJobSystem = Pick<
  JobSystemService,
  'transitionTo' | 'recordStageComplete' | 'completeJob' | 'failJob' | 'cancelJob' | 'getAbortSignal'
>;

/** The registry surface the worker reads capability bounds from (Req 7.3, 7.4). */
export type GenerativeEditCapabilityRegistry = Pick<ProviderCapabilityRegistryService, 'lookup'>;

/** The Generative_Editor surface the worker delegates the edit to (task 17.6). */
export type GenerativeEditorRunner = Pick<GenerativeEditorService, 'runGenerativeEdit'>;

/** Injectable dependencies (defaulted for production, overridable for tests). */
export interface GenerativeEditWorkerDeps {
  jobSystem: GenerativeEditJobSystem;
  registry: GenerativeEditCapabilityRegistry;
  generativeEditor: GenerativeEditorRunner;
  resolveProvider?: (provider: string, model: string) => VideoAIProvider | null;
  logger?: Pick<typeof defaultLogger, 'info' | 'warn' | 'error' | 'debug'>;
}

// ---------------------------------------------------------------------------
// Outcome
// ---------------------------------------------------------------------------

/** The settled outcome of running a generative-edit job. */
export type GenerativeEditJobOutcome =
  | { jobId: string; state: 'COMPLETED'; segments: number }
  | { jobId: string; state: 'CANCELLED'; cause: string }
  | { jobId: string; state: 'FAILED'; errorCode: string; detail: string };

// ---------------------------------------------------------------------------
// Payload validation (No-Mock: reject a malformed payload loudly, Req 23)
// ---------------------------------------------------------------------------

function isTimeRange(value: unknown): value is TimeRangeMs {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.startMs === 'number' &&
    Number.isFinite(r.startMs) &&
    typeof r.endMs === 'number' &&
    Number.isFinite(r.endMs)
  );
}

/**
 * Validate the queue-carried payload is a well-formed generative-edit request.
 * Returns the typed payload or `null` (the worker then fails the job with
 * {@link GEN_ERR_INVALID_PAYLOAD} — never silently succeeds).
 */
export function parseGenerativeEditPayload(raw: unknown): GenerativeEditJobPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  if (p.kind !== 'generative-edit') return null;

  const required = ['projectId', 'workspaceId', 'userId', 'inputVersionId', 'versionId', 'operationId'];
  for (const key of required) {
    if (typeof p[key] !== 'string' || (p[key] as string).length === 0) return null;
  }

  const source = p.source as Record<string, unknown> | undefined;
  if (!source || typeof source.storageKey !== 'string' || typeof source.fileName !== 'string') {
    return null;
  }
  if (!isTimeRange(p.affectedRegion)) return null;

  const provider = p.provider as Record<string, unknown> | undefined;
  if (!provider || typeof provider.provider !== 'string' || typeof provider.model !== 'string') {
    return null;
  }

  const prompt = p.prompt as Record<string, unknown> | undefined;
  if (!prompt || typeof prompt.userRequest !== 'string') return null;

  return raw as GenerativeEditJobPayload;
}

// ---------------------------------------------------------------------------
// Worker processor
// ---------------------------------------------------------------------------

/**
 * Run one generative-edit job asynchronously (Req 18.1). Reconstructs the
 * request from `payload`, drives the job state machine around the edit, and
 * settles the job from the discriminated {@link GenerativeEditResult}. Returns
 * the settled outcome; a hard failure thrown by the editor is caught, the job is
 * ensured FAILED, and the error is rethrown so BullMQ records the job failure.
 */
export async function runGenerativeEditJob(
  rawPayload: unknown,
  deps: GenerativeEditWorkerDeps,
): Promise<GenerativeEditJobOutcome> {
  const log = deps.logger ?? defaultLogger;
  const resolveProvider = deps.resolveProvider ?? resolveVideoProvider;

  const payload = parseGenerativeEditPayload(rawPayload);
  if (!payload) {
    // We cannot derive a job id from an invalid payload — surface loudly.
    log.error?.('Generative edit job payload is invalid', undefined, {
      component: 'GenerativeEditWorker',
    });
    throw new Error(`${GEN_ERR_INVALID_PAYLOAD}: generative-edit job payload is missing or malformed`);
  }

  const jobId = videoEditorJobId('generation', {
    projectId: payload.projectId,
    versionId: payload.versionId,
    opId: payload.operationId,
  });

  // (1) Resolve the Model_Router-selected provider adapter (Req 6.6, No-Mock).
  const provider = resolveProvider(payload.provider.provider, payload.provider.model);
  if (!provider) {
    await deps.jobSystem.failJob(jobId, GEN_ERR_PROVIDER_UNRESOLVED);
    log.error?.('Generative edit provider could not be resolved', undefined, {
      component: 'GenerativeEditWorker',
      jobId,
      provider: payload.provider.provider,
      model: payload.provider.model,
    });
    return {
      jobId,
      state: 'FAILED',
      errorCode: GEN_ERR_PROVIDER_UNRESOLVED,
      detail: `No adapter for provider ${payload.provider.provider}/${payload.provider.model}`,
    };
  }

  // (2) Resolve the provider's editable-input capability bounds + cost from the
  //     Provider_Capability_Registry (never hardcoded — Req 7.3, 7.4).
  const lookup = await deps.registry.lookup(payload.provider.provider, payload.provider.model);
  if (!lookup.supported) {
    await deps.jobSystem.failJob(jobId, GEN_ERR_CAPABILITY_UNKNOWN);
    log.error?.('Generative edit has no capability metadata for the selected provider', undefined, {
      component: 'GenerativeEditWorker',
      jobId,
      provider: payload.provider.provider,
      model: payload.provider.model,
    });
    return {
      jobId,
      state: 'FAILED',
      errorCode: GEN_ERR_CAPABILITY_UNKNOWN,
      detail: `No capability record for ${payload.provider.provider}/${payload.provider.model}`,
    };
  }
  const caps = { editableInputSeconds: lookup.caps.editableInputSeconds };
  const costPerOutputSecondInr = lookup.caps.costPerOutputSecondInr;

  // (3) Enter the EDITING pipeline stage before the edit begins (Req 18.2). The
  //     job's AbortSignal is honoured by the metering/provider call (Req 17.10).
  await deps.jobSystem.transitionTo(jobId, 'EDITING');
  const signal = deps.jobSystem.getAbortSignal(jobId);

  const request: GenerativeEditRequest = {
    projectId: payload.projectId,
    workspaceId: payload.workspaceId,
    userId: payload.userId,
    jobId,
    inputVersionId: payload.inputVersionId,
    versionId: payload.versionId,
    source: {
      storageKey: payload.source.storageKey,
      fileName: payload.source.fileName,
      durationMs: payload.source.durationMs,
    },
    affectedRegion: payload.affectedRegion,
    segmentation: {
      caps,
      sceneBoundariesMs: payload.segmentation?.sceneBoundariesMs ?? [],
      trackedSubjects: payload.segmentation?.trackedSubjects,
      utterances: payload.segmentation?.utterances,
      candidateRanges: payload.segmentation?.candidateRanges,
    },
    prompt: {
      userRequest: payload.prompt.userRequest,
      requiredProtectedElements: payload.prompt.requiredProtectedElements ?? [],
      operationType: payload.prompt.operationType,
      editingStyle: payload.prompt.editingStyle,
    },
    provider,
    metering: {
      idempotencyKey: payload.creditIdempotencyKey ?? jobId,
      costPerOutputSecondInr,
      // Background worker execution auto-confirms — the estimate/confirmation gate
      // is presented interactively before the job is ever enqueued (Req 17.7). The
      // server-side affordability gate still runs inside the metering service.
      signal,
      isZeroCostEdit: payload.isZeroCostEdit,
    },
    outputResolution: payload.outputResolution,
    timelineTrackIndex: payload.timelineTrackIndex,
  };

  // (4) Run the edit and settle the job from the discriminated result.
  let result: GenerativeEditResult;
  try {
    result = await deps.generativeEditor.runGenerativeEdit(request);
  } catch (error) {
    // A hard failure — the editor already marked the job FAILED with a specific
    // code; ensure FAILED and rethrow so BullMQ records the failure.
    await safeFailJob(deps.jobSystem, jobId, 'GENERATIVE_EDIT_FAILED', log);
    log.error?.('Generative edit threw a hard failure', error as Error, {
      component: 'GenerativeEditWorker',
      jobId,
    });
    throw error;
  }

  return settleJob(deps.jobSystem, jobId, result, log);
}

/** Map the discriminated {@link GenerativeEditResult} to a terminal job state. */
async function settleJob(
  jobSystem: GenerativeEditJobSystem,
  jobId: string,
  result: GenerativeEditResult,
  log: NonNullable<GenerativeEditWorkerDeps['logger']>,
): Promise<GenerativeEditJobOutcome> {
  switch (result.status) {
    case 'completed': {
      // Record the EDITING stage so progress is stage-derived (Req 18.4), then
      // complete the job with the produced segment artifacts recorded.
      await jobSystem.recordStageComplete(jobId, 'EDITING');
      const artifactIds = result.segments.map((s) => s.artifactId);
      await jobSystem.completeJob(jobId, artifactIds);
      log.info?.('Generative edit job completed', {
        component: 'GenerativeEditWorker',
        jobId,
        segments: result.segments.length,
      });
      return { jobId, state: 'COMPLETED', segments: result.segments.length };
    }

    case 'cancelled': {
      // Confirmation timeout / decline / abort — no deduction, timeline unchanged
      // (Req 17.8, 17.10). Mark the job CANCELLED (releases any reservation).
      await jobSystem.cancelJob(jobId);
      log.info?.('Generative edit job cancelled', {
        component: 'GenerativeEditWorker',
        jobId,
        cause: result.cause,
      });
      return { jobId, state: 'CANCELLED', cause: result.cause };
    }

    case 'blocked': {
      await safeFailJob(jobSystem, jobId, GEN_ERR_INSUFFICIENT_CREDITS, log);
      return {
        jobId,
        state: 'FAILED',
        errorCode: GEN_ERR_INSUFFICIENT_CREDITS,
        detail: result.reason,
      };
    }

    case 'invalid_input': {
      await safeFailJob(jobSystem, jobId, GEN_ERR_INVALID_INPUT, log);
      return { jobId, state: 'FAILED', errorCode: GEN_ERR_INVALID_INPUT, detail: result.message };
    }

    case 'reroute_required': {
      await safeFailJob(jobSystem, jobId, GEN_ERR_REROUTE_REQUIRED, log);
      return { jobId, state: 'FAILED', errorCode: GEN_ERR_REROUTE_REQUIRED, detail: result.message };
    }

    case 'protected_element_warning': {
      await safeFailJob(jobSystem, jobId, GEN_ERR_PROTECTED_ELEMENT, log);
      return {
        jobId,
        state: 'FAILED',
        errorCode: GEN_ERR_PROTECTED_ELEMENT,
        detail: result.warning,
      };
    }

    case 'extraction_failed': {
      // The editor already marked the job FAILED (Req 9.13); ensure it and report.
      await safeFailJob(jobSystem, jobId, result.errorCode || GEN_ERR_EXTRACTION_FAILED, log);
      return {
        jobId,
        state: 'FAILED',
        errorCode: result.errorCode || GEN_ERR_EXTRACTION_FAILED,
        detail: result.message,
      };
    }

    case 'quality_failed': {
      // The editor already marked the job FAILED (Req 9.14); ensure it and report.
      await safeFailJob(jobSystem, jobId, GEN_ERR_QUALITY_FAILED, log);
      return { jobId, state: 'FAILED', errorCode: GEN_ERR_QUALITY_FAILED, detail: result.message };
    }

    default: {
      // Exhaustiveness guard — a new result variant must be handled explicitly.
      const exhaustive: never = result;
      await safeFailJob(jobSystem, jobId, 'GENERATIVE_EDIT_FAILED', log);
      return {
        jobId,
        state: 'FAILED',
        errorCode: 'GENERATIVE_EDIT_FAILED',
        detail: `Unhandled generative edit result: ${JSON.stringify(exhaustive)}`,
      };
    }
  }
}

/** Fail a job defensively — a transition error (already terminal) is swallowed. */
async function safeFailJob(
  jobSystem: GenerativeEditJobSystem,
  jobId: string,
  errorCode: string,
  log: NonNullable<GenerativeEditWorkerDeps['logger']>,
): Promise<void> {
  try {
    await jobSystem.failJob(jobId, errorCode);
  } catch (error) {
    log.warn?.('Could not mark generative edit job FAILED (already terminal?)', {
      component: 'GenerativeEditWorker',
      jobId,
      errorCode,
      error: (error as Error)?.message,
    });
  }
}

// ---------------------------------------------------------------------------
// Production deps factory
// ---------------------------------------------------------------------------

/**
 * Build the production worker dependencies wired to the shared Job_System, the
 * Provider_Capability_Registry, and a Generative_Editor whose reroute resolver
 * uses {@link resolveVideoProvider}. Imported lazily by the worker so the module
 * graph is only pulled in when the `video-generation` queue is first used.
 */
export async function createGenerativeEditWorkerDeps(): Promise<GenerativeEditWorkerDeps> {
  const jobSystem = await getJobSystemService();
  const registry = getProviderCapabilityRegistry();
  const generativeEditor = new GenerativeEditorService({ resolveProvider: resolveVideoProvider });
  return { jobSystem, registry, generativeEditor, resolveProvider: resolveVideoProvider };
}
