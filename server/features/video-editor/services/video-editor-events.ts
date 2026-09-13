/**
 * Structured lifecycle + provider-call log events for the Video Editor
 * (task 22.1, Req 22.1, 22.2, 22.3, 22.4, 22.6).
 *
 * This is the single place the Video Editor emits its OBSERVABILITY events. It
 * reuses the existing pino `logger` (`server/config/logger.ts`) via its
 * string-first `logger.info(msg, context)` signature — it invents no new logging
 * transport — and guarantees three contracts every caller can rely on:
 *
 *   • Req 22.1 — a fixed LIFECYCLE event set (project creation, source ingestion,
 *     analysis start/complete, plan creation, edit submission, job start/complete/
 *     failure, render completion, export completion) is emitted as a structured
 *     event carrying the event type, an event timestamp, and the user / workspace
 *     / project / job identifiers (the job id only where a job is involved).
 *
 *   • Req 22.2 / 22.3 — a PROVIDER-CALL COMPLETION event records latency (ms),
 *     provider, model, output duration (s), estimated cost (credits), actual cost
 *     (credits), and retry count; a PROVIDER-CALL FAILURE event records latency
 *     (ms), provider, model, retry count, and a failure reason.
 *
 *   • Req 22.4 — provider API keys, secrets, authentication tokens, and signed /
 *     private media URLs are excluded from EVERY emitted event. Two layers make
 *     this true: (1) the event context only ever carries opaque identifiers and
 *     numeric metrics — never a media URL or a credential — and (2) every context
 *     is defensively passed through `redactSecrets` (task 21.1) so a secret-like
 *     VALUE embedded in a free-text field (e.g. a failure `reason`) is scrubbed
 *     before it is logged, complementing the logger's own key-based redaction.
 *
 *   • Req 22.6 — emitting a log event NEVER aborts the in-progress video
 *     operation. Every emit is wrapped so a logging fault (a serialisation error,
 *     a transport failure) is swallowed and the caller continues unaffected.
 *
 * The module owns no domain rules — it is a thin, side-effect-only helper the
 * lifecycle-bearing services (ingestion, analysis, planning, job system, render)
 * and the generative provider-call site invoke. The logger is injectable so a
 * test can capture the emitted events without a real transport.
 */

import { logger as defaultLogger } from '../../../config/logger';
import { redactSecrets } from '../api/error-envelope';

// ---------------------------------------------------------------------------
// Logging components
// ---------------------------------------------------------------------------

/** Component tag for lifecycle events (Req 22.1). */
export const LIFECYCLE_COMPONENT = 'videoEditor.Lifecycle';
/** Component tag for provider-call events (Req 22.2, 22.3). */
export const PROVIDER_CALL_COMPONENT = 'videoEditor.ProviderCall';

// ---------------------------------------------------------------------------
// Event types (Req 22.1 — the defined lifecycle event set)
// ---------------------------------------------------------------------------

/**
 * The fixed set of video lifecycle events (Req 22.1). Extending this set is a
 * deliberate change — callers must emit only a member of this union so the
 * observability surface stays enumerable and auditable.
 */
export type VideoLifecycleEvent =
  | 'project_created'
  | 'source_ingested'
  | 'analysis_started'
  | 'analysis_completed'
  | 'plan_created'
  | 'edit_submitted'
  | 'job_started'
  | 'job_completed'
  | 'job_failed'
  | 'render_completed'
  | 'export_completed';

/** All lifecycle events, in canonical order (useful for tests / validation). */
export const VIDEO_LIFECYCLE_EVENTS: readonly VideoLifecycleEvent[] = [
  'project_created',
  'source_ingested',
  'analysis_started',
  'analysis_completed',
  'plan_created',
  'edit_submitted',
  'job_started',
  'job_completed',
  'job_failed',
  'render_completed',
  'export_completed',
] as const;

// ---------------------------------------------------------------------------
// Shared identity fields
// ---------------------------------------------------------------------------

/**
 * The identifiers every video event carries where they apply (Req 22.1). All are
 * optional at the type level so a caller only supplies what its context knows;
 * the `jobId` is present only where a job is involved.
 */
export interface VideoEventIdentity {
  userId?: string;
  workspaceId?: string;
  projectId?: string;
  jobId?: string;
  sourceId?: string;
  versionId?: string;
}

/** The injectable logger surface (defaults to the app logger). */
export type EventLogger = Pick<typeof defaultLogger, 'info' | 'warn'>;

/** Optional dependencies for an event emit (logger override for tests). */
export interface EmitDeps {
  logger?: EventLogger;
}

// ---------------------------------------------------------------------------
// Lifecycle events (Req 22.1)
// ---------------------------------------------------------------------------

/** Extra, non-secret structured details attached to a lifecycle event. */
export interface LifecycleEventInput extends VideoEventIdentity {
  /**
   * Additional structured, NON-secret detail (counts, durations, stage names,
   * error codes, …). NEVER pass a media URL, credential, or token here — the
   * context is defensively redacted, but callers should not rely on redaction.
   */
  details?: Record<string, unknown>;
}

/**
 * Emit a structured lifecycle event (Req 22.1). The emitted context always
 * carries `event` (the type), `eventTimestamp` (ISO-8601), the supplied
 * identifiers, and any extra `details`. The whole context is redacted before it
 * is logged (Req 22.4) and the emit can never throw (Req 22.6).
 */
export function emitLifecycleEvent(
  event: VideoLifecycleEvent,
  input: LifecycleEventInput = {},
  deps: EmitDeps = {},
): void {
  const log = deps.logger ?? defaultLogger;
  try {
    const { details, ...identity } = input;
    const context = {
      component: LIFECYCLE_COMPONENT,
      event,
      eventTimestamp: new Date().toISOString(),
      ...pruneUndefined(identity),
      ...(details ? pruneUndefined(details) : {}),
    };
    log.info(`[VideoEditor] lifecycle:${event}`, redactSecrets(context));
  } catch {
    // Req 22.6 — a logging fault must never abort the in-progress operation.
  }
}

// ---------------------------------------------------------------------------
// Provider-call events (Req 22.2, 22.3)
// ---------------------------------------------------------------------------

/** A completed AI provider call's metrics (Req 22.2). */
export interface ProviderCallCompletedInput extends VideoEventIdentity {
  /** The generative provider identifier (e.g. `gemini`). */
  provider: string;
  /** The model identifier (e.g. `omni-1`). */
  model: string;
  /** End-to-end call latency in milliseconds (Req 22.2). */
  latencyMs: number;
  /** Measured output duration in seconds (Req 22.2). */
  outputSeconds: number;
  /** Credits the call was estimated to cost before execution (Req 22.2). */
  estimatedCredits: number;
  /** Credits the call actually settled to (Req 22.2). */
  actualCredits: number;
  /** Number of prior retries for this unit of work (Req 22.2). */
  retryCount: number;
  /** Optional operation type hint (e.g. `generative_edit`). */
  operationType?: string;
}

/** A failed AI provider call's metrics (Req 22.3). */
export interface ProviderCallFailedInput extends VideoEventIdentity {
  /** The generative provider identifier (e.g. `gemini`). */
  provider: string;
  /** The model identifier (e.g. `omni-1`). */
  model: string;
  /** End-to-end latency until failure in milliseconds (Req 22.3). */
  latencyMs: number;
  /** Number of prior retries for this unit of work (Req 22.3). */
  retryCount: number;
  /** A failure reason indicating the cause (redacted of any secret-like value). */
  reason: string;
  /** Optional operation type hint (e.g. `generative_edit`). */
  operationType?: string;
}

/**
 * Emit a structured provider-call COMPLETION event (Req 22.2): latency, provider,
 * model, output seconds, estimated cost, actual cost, and retry count. The
 * context is redacted (Req 22.4) and the emit can never throw (Req 22.6).
 */
export function emitProviderCallCompleted(
  input: ProviderCallCompletedInput,
  deps: EmitDeps = {},
): void {
  const log = deps.logger ?? defaultLogger;
  try {
    const { provider, model, latencyMs, outputSeconds, estimatedCredits, actualCredits, retryCount, operationType, ...identity } =
      input;
    const context = {
      component: PROVIDER_CALL_COMPONENT,
      outcome: 'completed' as const,
      eventTimestamp: new Date().toISOString(),
      provider,
      model,
      latencyMs: safeNumber(latencyMs),
      outputSeconds: safeNumber(outputSeconds),
      estimatedCredits: safeNumber(estimatedCredits),
      actualCredits: safeNumber(actualCredits),
      retryCount: safeInt(retryCount),
      ...(operationType ? { operationType } : {}),
      ...pruneUndefined(identity),
    };
    log.info(`[VideoEditor] providerCall:completed ${provider}/${model}`, redactSecrets(context));
  } catch {
    // Req 22.6 — a logging fault must never abort the in-progress operation.
  }
}

/**
 * Emit a structured provider-call FAILURE event (Req 22.3): latency, provider,
 * model, retry count, and a failure reason. The reason (and the whole context)
 * is redacted of secret-like values (Req 22.4) and the emit can never throw
 * (Req 22.6).
 */
export function emitProviderCallFailed(
  input: ProviderCallFailedInput,
  deps: EmitDeps = {},
): void {
  const log = deps.logger ?? defaultLogger;
  try {
    const { provider, model, latencyMs, retryCount, reason, operationType, ...identity } = input;
    const context = {
      component: PROVIDER_CALL_COMPONENT,
      outcome: 'failed' as const,
      eventTimestamp: new Date().toISOString(),
      provider,
      model,
      latencyMs: safeNumber(latencyMs),
      retryCount: safeInt(retryCount),
      reason,
      ...(operationType ? { operationType } : {}),
      ...pruneUndefined(identity),
    };
    log.warn(`[VideoEditor] providerCall:failed ${provider}/${model}`, redactSecrets(context));
  } catch {
    // Req 22.6 — a logging fault must never abort the in-progress operation.
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Drop keys whose value is `undefined` so the emitted context stays clean. */
function pruneUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/** Coerce to a finite number (0 when NaN/Infinity/undefined) — logs never carry NaN. */
function safeNumber(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

/** Coerce to a non-negative integer retry/count value. */
function safeInt(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}
