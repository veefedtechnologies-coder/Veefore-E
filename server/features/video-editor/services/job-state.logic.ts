/**
 * Job state machine & progress — pure (DB-free, IO-free) core for the
 * Video_Editor Job_System (Req 18.2, 18.4, 23.2, 23.6).
 *
 * A `Video_Edit_Job` is an asynchronous unit of work executed on a BullMQ
 * worker. Its lifecycle is governed by a single-valued state machine and its
 * reported progress is derived solely from actually-completed stages. Both are
 * decided entirely by the pure functions here so they can be property-tested
 * without Redis, MongoDB, or a running worker:
 *
 *   1. Single-valued state (Req 18.2). At any instant a job holds EXACTLY ONE
 *      state from the twelve-state set. COMPLETED, FAILED, and CANCELLED are
 *      terminal *absorbing* states — once reached, no further transition is
 *      permitted (Property 43).
 *
 *   2. Stage-derived, monotonic, never-premature progress (Req 18.4, 23.2,
 *      23.6). Progress is a non-decreasing integer in [0,100] computed SOLELY
 *      from the count of completed stages over total stages; it is never 100 /
 *      "complete" while any stage remains incomplete, and it is reported as
 *      INDETERMINATE whenever the actual completion state is unknown
 *      (Property 8).
 *
 * This module is the canonical source of the `JobState` type and the ordered
 * state set; the Mongoose model re-exports them so the schema enum and the
 * state machine can never drift apart.
 */

// ---------------------------------------------------------------------------
// States (Req 18.2)
// ---------------------------------------------------------------------------

/**
 * The twelve — and only twelve — job states. A job holds EXACTLY ONE at any
 * time (Req 18.2).
 */
export const JOB_STATES = [
  'QUEUED',
  'PREPARING',
  'UPLOADING',
  'ANALYZING',
  'PLANNING',
  'EDITING',
  'RENDERING',
  'QUALITY_CHECK',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'RETRYING',
] as const;

/** One of the twelve job states (Req 18.2). */
export type JobState = (typeof JOB_STATES)[number];

/**
 * The terminal *absorbing* states. Once a job reaches one of these no further
 * state transition occurs (Req 18.2, Property 43).
 */
export const TERMINAL_STATES = ['COMPLETED', 'FAILED', 'CANCELLED'] as const;

/** A terminal (absorbing) job state (Req 18.2). */
export type TerminalState = (typeof TERMINAL_STATES)[number];

/**
 * The ordered pipeline processing stages a job advances through. These — and
 * only these — represent "work stages" and drive stage-derived progress. QUEUED
 * (not yet started) and RETRYING (transient) are not pipeline stages; the
 * terminal states are outcomes, not stages.
 */
export const PIPELINE_STAGES = [
  'PREPARING',
  'UPLOADING',
  'ANALYZING',
  'PLANNING',
  'EDITING',
  'RENDERING',
  'QUALITY_CHECK',
] as const;

/** A pipeline processing stage (a subset of JobState). */
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

// ---------------------------------------------------------------------------
// State guards (Req 18.2)
// ---------------------------------------------------------------------------

/** Type guard: is `value` exactly one of the twelve job states (Req 18.2)? */
export function isJobState(value: unknown): value is JobState {
  return typeof value === 'string' && (JOB_STATES as readonly string[]).includes(value);
}

/**
 * Is `state` a terminal *absorbing* state (COMPLETED / FAILED / CANCELLED)?
 * A job in a terminal state permits no further transition (Req 18.2,
 * Property 43).
 */
export function isTerminalState(state: JobState): boolean {
  return (TERMINAL_STATES as readonly string[]).includes(state);
}

/** Is `state` one of the ordered pipeline processing stages? */
export function isPipelineStage(value: unknown): value is PipelineStage {
  return typeof value === 'string' && (PIPELINE_STAGES as readonly string[]).includes(value);
}

/** Zero-based order of a pipeline stage, or -1 if it is not a pipeline stage. */
export function pipelineStageIndex(stage: JobState): number {
  return (PIPELINE_STAGES as readonly string[]).indexOf(stage);
}

// ---------------------------------------------------------------------------
// Transition rules (Req 18.2, Property 43)
// ---------------------------------------------------------------------------

/**
 * Decide whether a single-step transition `from → to` is permitted, keeping the
 * job single-valued and the terminal states absorbing (Req 18.2, Property 43).
 *
 * Pure and total: never throws, never performs IO. Rules:
 *   - Unknown states, or a self-transition, are never permitted.
 *   - A TERMINAL state is absorbing: no outgoing transition is ever permitted.
 *   - Any non-terminal state may fail or be cancelled at any time
 *     (→ FAILED / → CANCELLED).
 *   - Any non-terminal, non-RETRYING state may enter RETRYING.
 *   - RETRYING may re-enter the queue (→ QUEUED) or resume at any pipeline stage.
 *   - QUEUED may begin at any pipeline stage.
 *   - A pipeline stage may only advance to a *later* pipeline stage (monotonic
 *     forward) or reach COMPLETED after having done work.
 */
export function canTransition(from: unknown, to: unknown): boolean {
  if (!isJobState(from) || !isJobState(to)) return false;
  if (from === to) return false; // no self-loops — a state is not a transition
  if (isTerminalState(from)) return false; // terminal states are absorbing

  // Failure / cancellation may occur from any non-terminal state.
  if (to === 'FAILED' || to === 'CANCELLED') return true;

  // Entering the transient RETRYING state (not from RETRYING itself).
  if (to === 'RETRYING') return from !== 'RETRYING';

  // Re-queueing is only reachable out of RETRYING.
  if (to === 'QUEUED') return from === 'RETRYING';

  // Completion is only reachable after real work (from a pipeline stage).
  if (to === 'COMPLETED') return isPipelineStage(from);

  // Otherwise `to` is a pipeline stage.
  if (isPipelineStage(to)) {
    if (from === 'QUEUED' || from === 'RETRYING') return true; // (re)start at any stage
    if (isPipelineStage(from)) return pipelineStageIndex(to) > pipelineStageIndex(from);
    return false;
  }

  return false;
}

/** Result of attempting a job state transition. */
export type TransitionResult =
  | { ok: true; state: JobState }
  | { ok: false; error: string };

/**
 * Apply a state transition, enforcing the single-valued, terminal-absorbing
 * machine (Req 18.2, Property 43). Returns the new state on success, or an
 * error describing the rejected transition — the caller keeps the prior state
 * unchanged on failure. Pure and total.
 */
export function transition(from: unknown, to: unknown): TransitionResult {
  if (!isJobState(from)) {
    return { ok: false, error: `Invalid current job state: ${String(from)}` };
  }
  if (!isJobState(to)) {
    return { ok: false, error: `Invalid target job state: ${String(to)}` };
  }
  if (isTerminalState(from)) {
    return { ok: false, error: `Job is in terminal state ${from}; no transition to ${to} is permitted` };
  }
  if (!canTransition(from, to)) {
    return { ok: false, error: `Illegal job state transition: ${from} → ${to}` };
  }
  return { ok: true, state: to };
}

/**
 * The set of states reachable from `from` in one step (empty for a terminal
 * state). Useful for validation/UI; derived from `canTransition` so it can
 * never disagree with it.
 */
export function allowedTransitions(from: JobState): JobState[] {
  if (isTerminalState(from)) return [];
  return JOB_STATES.filter((to) => canTransition(from, to));
}

// ---------------------------------------------------------------------------
// Progress (Req 18.4, 23.2, 23.6, Property 8)
// ---------------------------------------------------------------------------

/**
 * A reported progress value. It is either a determinate integer percentage in
 * [0,100], or explicitly INDETERMINATE when the actual completion state is
 * unknown (Req 23.6). Progress is NEVER a fabricated percentage while unknown.
 */
export type ProgressReport =
  | { determinate: true; percent: number }
  | { determinate: false };

/** The single indeterminate progress value (Req 23.6). */
export const INDETERMINATE_PROGRESS: ProgressReport = Object.freeze({ determinate: false });

/** Build a determinate progress report (used internally; percent must be an int in [0,100]). */
function determinate(percent: number): ProgressReport {
  return { determinate: true, percent };
}

/**
 * Compute progress SOLELY from the count of completed stages over total stages
 * (Req 18.4, 23.2). The result is a non-decreasing integer in [0,100] as
 * `completed` grows for a fixed `total`, and reaches 100 ONLY when every stage
 * has completed (`completed === total`) — floor() guarantees any partial count
 * yields at most 99, so progress is never prematurely "complete" (Property 8).
 *
 * When the completion state cannot be determined — a non-positive or non-integer
 * `total`, or a negative/non-integer `completed` — progress is INDETERMINATE
 * (Req 23.6). A `completed` count above `total` is clamped to `total` rather
 * than exceeding 100.
 *
 * Pure and total: never throws, never performs IO.
 */
export function progressFromStages(completedStages: number, totalStages: number): ProgressReport {
  if (!Number.isInteger(totalStages) || totalStages <= 0) return INDETERMINATE_PROGRESS;
  if (!Number.isInteger(completedStages) || completedStages < 0) return INDETERMINATE_PROGRESS;

  const completed = Math.min(completedStages, totalStages);
  const percent = Math.floor((completed / totalStages) * 100);
  return determinate(percent);
}

/** Inputs for job-level progress reporting. */
export interface JobProgressInput {
  /** The job's current single state (Req 18.2). */
  state: JobState;
  /** Number of stages actually completed (Req 18.4). */
  completedStages: number;
  /** Total number of stages for this job. Unknown/invalid ⇒ indeterminate. */
  totalStages: number;
}

/**
 * Report a job's progress, binding the stage-derived value to the job's actual
 * state (Req 18.4, 23.2, 23.6, Property 8):
 *
 *   - COMPLETED ⇒ 100 (the only state that may report a completed value).
 *   - FAILED / CANCELLED ⇒ the stage-derived value frozen at the point of
 *     termination (indeterminate if the stage counts are unknown).
 *   - Any executing state ⇒ the stage-derived value, but NEVER 100 while the
 *     job is not COMPLETED (clamped to 99), so progress is never prematurely
 *     complete.
 *   - Unknown completion state (invalid stage counts) ⇒ INDETERMINATE.
 *
 * Pure and total.
 */
export function computeJobProgress(input: JobProgressInput): ProgressReport {
  const { state, completedStages, totalStages } = input;

  // COMPLETED is the sole state permitted to report a completed value.
  if (state === 'COMPLETED') return determinate(100);

  const report = progressFromStages(completedStages, totalStages);
  if (!report.determinate) return report; // unknown ⇒ indeterminate (Req 23.6)

  // Never report 100 / "complete" while the job is not COMPLETED (Req 23.2/23.6).
  if (report.percent >= 100) return determinate(99);
  return report;
}

/**
 * Enforce non-decreasing progress across successive reports (Req 18.4:
 * progress is monotonically non-decreasing). When both the previous and current
 * reports are determinate, the greater percentage is kept; an indeterminate
 * report on either side is passed through unchanged (an unknown state cannot
 * assert a specific value). Pure and total.
 */
export function clampMonotonicProgress(
  previous: ProgressReport,
  current: ProgressReport,
): ProgressReport {
  if (!previous.determinate || !current.determinate) return current;
  return determinate(Math.max(previous.percent, current.percent));
}
