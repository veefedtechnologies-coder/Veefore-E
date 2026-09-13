/**
 * Video Editor (client) — job status/progress interpretation (pure).
 *
 * The job/progress panel consumes the stage-derived status endpoints from
 * task 20.2:
 *   - `GET /api/video-editor/jobs/:jobId`         (one-shot status)
 *   - `GET /api/video-editor/jobs/:jobId/stream`  (NDJSON progress stream)
 *
 * Both surfaces report progress that the SERVER derives solely from the count of
 * completed pipeline stages, and mark it indeterminate (`determinate: false`,
 * `progress: null`) whenever the completion state is unknown (Req 18.4, 23.2,
 * 23.6). This module normalizes either shape into a single {@link JobStatusView}
 * the UI renders from, and — critically — NEVER fabricates a percentage: when the
 * server says indeterminate, the view's `percent` is `null` (Req 23.6).
 *
 * Kept pure so the indeterminate/terminal handling is unit- and property-testable
 * without a network.
 */

/** The terminal job states (mirrors the server `job-state.logic.ts` set). */
export const TERMINAL_JOB_STATES = ['COMPLETED', 'FAILED', 'CANCELLED'] as const;

/** Human-readable labels for each job state. */
export const JOB_STATE_LABELS: Record<string, string> = {
  QUEUED: 'Queued',
  PREPARING: 'Preparing',
  UPLOADING: 'Uploading',
  ANALYZING: 'Analyzing',
  PLANNING: 'Planning',
  EDITING: 'Editing',
  RENDERING: 'Rendering',
  QUALITY_CHECK: 'Quality check',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
  RETRYING: 'Retrying',
};

/** The raw job status payload returned by `GET /jobs/:jobId` (`data` envelope). */
export interface JobStatusPayload {
  jobId: string;
  projectId?: string;
  state?: string;
  terminal?: boolean;
  determinate?: boolean;
  progress?: number | null;
  completedStages?: string[] | number;
  totalStages?: number;
  attempt?: number;
  timeoutSec?: number;
  inputArtifactIds?: string[];
  outputArtifactIds?: string[];
  errorCode?: string;
}

/** A single NDJSON event from `GET /jobs/:jobId/stream`. */
export type JobStreamEvent =
  | {
      type: 'progress' | 'complete';
      jobId: string;
      projectId?: string;
      state?: string;
      terminal?: boolean;
      determinate?: boolean;
      progress?: number | null;
      completedStages?: string[] | number;
      totalStages?: number;
      errorCode?: string;
    }
  | { type: 'error'; jobId: string; code?: string };

/** The normalized, render-ready view of a job's stage-derived status. */
export interface JobStatusView {
  jobId: string;
  projectId: string | null;
  state: string;
  label: string;
  terminal: boolean;
  /** Whether the completion state is known (determinate) or not (Req 23.6). */
  determinate: boolean;
  /**
   * Stage-derived integer percent in [0,100], or `null` when indeterminate. NEVER
   * fabricated: a `null` here means "unknown", so the UI shows an indeterminate
   * indicator rather than a specific percentage (Req 23.6).
   */
  percent: number | null;
  completedStages: number;
  totalStages: number;
  errorCode: string | null;
  /** True only when the job reached the COMPLETED terminal state. */
  succeeded: boolean;
  /** True when the job reached FAILED or CANCELLED. */
  failed: boolean;
}

/** Whether a state string is a terminal job state. */
export function isTerminalJobState(state: string | undefined): boolean {
  return typeof state === 'string' && (TERMINAL_JOB_STATES as readonly string[]).includes(state);
}

/** Coerce a completedStages field (array or count) into a stage count. */
function stageCount(value: string[] | number | undefined): number {
  if (Array.isArray(value)) return value.length;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.floor(value));
  return 0;
}

/** Clamp a percent into an integer in [0,100], or `null` when not a finite number. */
function clampPercent(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * Normalize a job status payload or a stream event into a {@link JobStatusView}.
 *
 * The server is authoritative for whether progress is determinate; this function
 * enforces the safety invariant that an indeterminate report NEVER carries a
 * percentage (Req 23.6): if `determinate` is not exactly `true`, `percent` is
 * forced to `null` regardless of any value present on the payload.
 */
export function interpretJobStatus(
  input: JobStatusPayload | JobStreamEvent,
): JobStatusView {
  const jobId = String((input as { jobId?: unknown }).jobId ?? '');
  const state = typeof (input as { state?: unknown }).state === 'string'
    ? (input as { state: string }).state
    : 'QUEUED';
  const errorCodeRaw =
    (input as { errorCode?: unknown }).errorCode ?? (input as { code?: unknown }).code;
  const errorCode = typeof errorCodeRaw === 'string' && errorCodeRaw.length > 0 ? errorCodeRaw : null;

  const terminal =
    (input as { terminal?: unknown }).terminal === true || isTerminalJobState(state);
  const determinate = (input as { determinate?: unknown }).determinate === true;

  // Enforce Req 23.6: no percentage unless the server marked the state determinate.
  const percent = determinate ? clampPercent((input as { progress?: unknown }).progress) : null;

  const totalStagesRaw = (input as { totalStages?: unknown }).totalStages;
  const totalStages =
    typeof totalStagesRaw === 'number' && Number.isFinite(totalStagesRaw)
      ? Math.max(0, Math.floor(totalStagesRaw))
      : 0;

  return {
    jobId,
    projectId:
      typeof (input as { projectId?: unknown }).projectId === 'string'
        ? (input as { projectId: string }).projectId
        : null,
    state,
    label: JOB_STATE_LABELS[state] ?? state,
    terminal,
    determinate,
    percent,
    completedStages: stageCount((input as { completedStages?: string[] | number }).completedStages),
    totalStages,
    errorCode,
    succeeded: state === 'COMPLETED',
    failed: state === 'FAILED' || state === 'CANCELLED',
  };
}
