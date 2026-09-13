/**
 * Video Editor (client) — conversational-turn event model + reducer (pure).
 *
 * The conversational edit box posts a turn to
 * `POST /api/video-editor/projects/:id/converse` and the server streams
 * newline-delimited JSON events describing the turn's pipeline
 * (Intent_Router → new Version → Editing_Planner → Model_Router → editors).
 * This module types those events and reduces them into a single
 * {@link ConverseTurnState} the UI renders from.
 *
 * Kept pure (state + event in, next state out) so the reducer is unit- and
 * property-testable without a network or React. The streaming hook wires the
 * NDJSON transport into it (see `useVideoEditorConverse`).
 *
 * Progress here is ALWAYS the stage-derived integer the server computes from the
 * count of completed pipeline stages (never a timer-interpolated value), and is
 * `null` (indeterminate) until the first stage event arrives (Req 23.2, 23.6).
 *
 * A generative turn also carries a credit-estimate confirmation seam (Req 17.7):
 * before the operation executes the server streams an `estimate` event with the
 * server-computed cost, and the turn pauses in an `awaiting_confirmation` phase
 * until the user confirms/declines (or the 300 s window elapses). The three
 * `estimate_*` decision events are dispatched by the confirmation UI (via the
 * streaming hook) so the confirmation lifecycle stays in this single, pure
 * reducer — see `creditEstimate.ts` for the estimate model + timeout helpers.
 */

import {
  parseCreditEstimateEvent,
  initialCreditEstimateState,
  CONFIRMATION_TIMEOUT_MS,
  type CreditEstimateState,
  type CreditEstimateEventPayload,
} from './creditEstimate';

/** Server-streamed conversational-turn events (mirrors `conversation.routes.ts`). */
export type ConverseEvent =
  | { type: 'status'; status?: string; stage?: string; progress?: number; projectId?: string }
  | { type: 'progress'; stage?: string; progress?: number; projectId?: string }
  | {
      type: 'clarification';
      reason?: string;
      maxConfidence?: number;
      stateChanged?: boolean;
      projectId?: string;
    }
  | { type: 'version'; versionId?: string; parentVersionId?: string | null; projectId?: string }
  | {
      type: 'plan';
      versionId?: string;
      projectGoal?: string;
      operationCount?: number;
      operations?: ConversePlanOperation[];
      warnings?: string[];
      projectId?: string;
    }
  | ({ type: 'routing' } & ConverseRoutedOperation)
  | ({
      /**
       * Server-computed credit estimate for the turn's generative operation,
       * streamed BEFORE it executes so the user can confirm (Req 17.7). Carries
       * the authoritative cost/affordability figures; `presentedAtMs` is stamped
       * by the client on receipt to drive the 300 s confirmation window.
       */
      type: 'estimate';
      presentedAtMs?: number;
      projectId?: string;
    } & CreditEstimateEventPayload)
  /** The user confirmed the presented estimate — the operation may proceed. */
  | { type: 'estimate_confirmed'; projectId?: string }
  /** The user declined the estimate — cancelled, no provider call (Req 17.8). */
  | { type: 'estimate_declined'; projectId?: string }
  /** The 300 s window elapsed — cancelled, no provider call (Req 17.8). */
  | { type: 'estimate_expired'; projectId?: string }
  | {
      type: 'complete';
      outcome?: ConverseOutcome;
      stateChanged?: boolean;
      versionId?: string;
      parentVersionId?: string | null;
      operationCount?: number;
      routedOperations?: ConverseRoutedOperation[];
      progress?: number;
      gateIntents?: string[];
      projectId?: string;
    }
  | { type: 'error'; code?: string; error?: string; projectId?: string }
  | { type: 'stopped'; projectId?: string };

/** A single planned operation as surfaced on the `plan` event. */
export interface ConversePlanOperation {
  sequenceIndex: number;
  type?: string;
  kind: string;
  range?: { startMs: number; endMs: number };
  status?: string;
  limitation?: string | null;
}

/** A routed operation entry (from a `routing` event or the final `complete`). */
export interface ConverseRoutedOperation {
  sequenceIndex: number;
  operationId?: string;
  kind: string;
  status?: string;
  engine?: 'deterministic' | 'generative' | 'analysis' | 'render' | 'unavailable';
  provider?: string;
  model?: string;
  reason?: string;
  limitation?: string | null;
  jobId?: string;
  queueJobId?: string | null;
  projectId?: string;
}

export type ConverseOutcome = 'planned' | 'clarification' | 'not_video_edit';

export type ConversePhase =
  | 'idle'
  | 'streaming'
  | 'awaiting_confirmation'
  | 'clarification'
  | 'complete'
  | 'error'
  | 'stopped';

/** The accumulated state of a single conversational editing turn. */
export interface ConverseTurnState {
  phase: ConversePhase;
  /** Latest human-readable status line from the server (e.g. "Planning the edit…"). */
  statusText: string | null;
  /** The pipeline stage the latest event belongs to. */
  stage: string | null;
  /**
   * Stage-derived integer progress in [0,100], or `null` when indeterminate
   * (no stage event yet). NEVER timer-interpolated (Req 23.2, 23.6).
   */
  progress: number | null;
  /** The new immutable version this turn created (once the `version` event lands). */
  versionId: string | null;
  parentVersionId: string | null;
  /** The plan for the turn, once the `plan` event lands. */
  plan: {
    projectGoal: string | null;
    operationCount: number;
    operations: ConversePlanOperation[];
    warnings: string[];
  } | null;
  /** Routed operations, keyed/ordered by `sequenceIndex`. */
  routedOperations: ConverseRoutedOperation[];
  /** Job ids spawned by generative operations in this turn (for the job panel). */
  jobIds: string[];
  /** Set when the turn asked for clarification and changed nothing (Req 2.6). */
  clarification: { reason: string | null; maxConfidence: number | null } | null;
  /**
   * The server-computed credit estimate presented for confirmation before a
   * generative operation executes, plus its confirmation lifecycle state
   * (Req 17.7–17.9). `null` until an `estimate` event arrives on the turn.
   */
  creditEstimate: CreditEstimateState | null;
  /** Set on a mid-stream error event (No-Mock, Req 23.5). */
  error: { code: string | null; message: string | null } | null;
  /** The turn's terminal outcome, once complete. */
  outcome: ConverseOutcome | null;
  /** Whether the turn changed project state (false for clarification/no-op). */
  stateChanged: boolean;
}

/** The initial (idle) turn state. */
export function initialConverseTurnState(): ConverseTurnState {
  return {
    phase: 'idle',
    statusText: null,
    stage: null,
    progress: null,
    versionId: null,
    parentVersionId: null,
    plan: null,
    routedOperations: [],
    jobIds: [],
    clarification: null,
    creditEstimate: null,
    error: null,
    outcome: null,
    stateChanged: false,
  };
}

/** Clamp a server-provided progress into a valid integer percent, or `null`. */
function normalizeProgress(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * Merge a routed-operation entry into the list by `sequenceIndex` (later events
 * for the same op replace earlier ones), preserving ascending order.
 */
function upsertRoutedOperation(
  list: ConverseRoutedOperation[],
  entry: ConverseRoutedOperation,
): ConverseRoutedOperation[] {
  const next = list.filter((op) => op.sequenceIndex !== entry.sequenceIndex);
  next.push(entry);
  next.sort((a, b) => a.sequenceIndex - b.sequenceIndex);
  return next;
}

/** Collect the job ids referenced by a set of routed operations (unique, ordered). */
function collectJobIds(list: ConverseRoutedOperation[]): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const op of list) {
    if (typeof op.jobId === 'string' && op.jobId && !seen.has(op.jobId)) {
      seen.add(op.jobId);
      ids.push(op.jobId);
    }
  }
  return ids;
}

/**
 * Pure reducer: apply one streamed {@link ConverseEvent} to a
 * {@link ConverseTurnState}, returning the next state. Unknown event types are
 * ignored (the state is returned unchanged) so a forward-compatible server never
 * breaks the client.
 */
export function reduceConverseEvent(
  state: ConverseTurnState,
  event: ConverseEvent,
): ConverseTurnState {
  switch (event.type) {
    case 'status': {
      const progress = normalizeProgress(event.progress);
      return {
        ...state,
        phase: 'streaming',
        statusText: typeof event.status === 'string' ? event.status : state.statusText,
        stage: typeof event.stage === 'string' ? event.stage : state.stage,
        progress: progress ?? state.progress,
      };
    }

    case 'progress': {
      const progress = normalizeProgress(event.progress);
      return {
        ...state,
        phase: 'streaming',
        stage: typeof event.stage === 'string' ? event.stage : state.stage,
        progress: progress ?? state.progress,
      };
    }

    case 'version':
      return {
        ...state,
        phase: 'streaming',
        versionId: typeof event.versionId === 'string' ? event.versionId : state.versionId,
        parentVersionId:
          event.parentVersionId === undefined ? state.parentVersionId : event.parentVersionId ?? null,
      };

    case 'plan':
      return {
        ...state,
        phase: 'streaming',
        plan: {
          projectGoal: typeof event.projectGoal === 'string' ? event.projectGoal : null,
          operationCount:
            typeof event.operationCount === 'number' ? event.operationCount : (event.operations?.length ?? 0),
          operations: Array.isArray(event.operations) ? event.operations : [],
          warnings: Array.isArray(event.warnings) ? event.warnings : [],
        },
      };

    case 'routing': {
      const { type: _type, ...entry } = event;
      const routedOperations = upsertRoutedOperation(state.routedOperations, entry);
      return {
        ...state,
        phase: 'streaming',
        routedOperations,
        jobIds: collectJobIds(routedOperations),
      };
    }

    case 'estimate': {
      // The server-computed estimate (Req 17.7). A malformed/empty payload
      // carries no usable cost and is ignored (No-Mock: the client never
      // fabricates a figure) — the turn keeps streaming.
      const parsed = parseCreditEstimateEvent(event);
      if (!parsed) return state;
      const creditEstimate = initialCreditEstimateState(
        parsed.estimate,
        parsed.affordability,
        typeof event.presentedAtMs === 'number' ? event.presentedAtMs : null,
        typeof event.confirmationTimeoutMs === 'number'
          ? event.confirmationTimeoutMs
          : CONFIRMATION_TIMEOUT_MS,
      );
      return {
        ...state,
        // Pause the turn for the user's decision; a blocked estimate still pauses
        // so the upgrade/add-credit path is presented rather than executing.
        phase: 'awaiting_confirmation',
        creditEstimate,
      };
    }

    case 'estimate_confirmed':
      // The user confirmed — resume streaming toward execution (Req 17.7).
      if (!state.creditEstimate) return state;
      return {
        ...state,
        phase: 'streaming',
        creditEstimate: { ...state.creditEstimate, status: 'confirmed' },
      };

    case 'estimate_declined':
      // Declined — cancelled with no provider call and no deduction (Req 17.8).
      if (!state.creditEstimate) return state;
      return {
        ...state,
        phase: 'stopped',
        creditEstimate: { ...state.creditEstimate, status: 'declined' },
      };

    case 'estimate_expired':
      // The 300 s window elapsed — cancelled, no provider call (Req 17.8).
      if (!state.creditEstimate) return state;
      return {
        ...state,
        phase: 'stopped',
        creditEstimate: { ...state.creditEstimate, status: 'expired' },
      };

    case 'clarification':
      return {
        ...state,
        phase: 'clarification',
        clarification: {
          reason: typeof event.reason === 'string' ? event.reason : null,
          maxConfidence: typeof event.maxConfidence === 'number' ? event.maxConfidence : null,
        },
        stateChanged: false,
      };

    case 'complete': {
      // Reconcile any routed operations delivered on the terminal event.
      let routedOperations = state.routedOperations;
      if (Array.isArray(event.routedOperations)) {
        for (const entry of event.routedOperations) {
          routedOperations = upsertRoutedOperation(routedOperations, entry);
        }
      }
      const progress = normalizeProgress(event.progress);
      const outcome = event.outcome ?? (state.clarification ? 'clarification' : 'planned');
      return {
        ...state,
        // A clarification-outcome complete keeps the clarification phase so the UI
        // continues to prompt the user; otherwise the turn is done.
        phase: outcome === 'clarification' ? 'clarification' : 'complete',
        outcome,
        stateChanged: event.stateChanged === true,
        versionId: typeof event.versionId === 'string' ? event.versionId : state.versionId,
        parentVersionId:
          event.parentVersionId === undefined ? state.parentVersionId : event.parentVersionId ?? null,
        routedOperations,
        jobIds: collectJobIds(routedOperations),
        // On a real completion progress reaches 100; otherwise keep prior value.
        progress: progress ?? (outcome === 'planned' ? 100 : state.progress),
      };
    }

    case 'error':
      return {
        ...state,
        phase: 'error',
        error: {
          code: typeof event.code === 'string' ? event.code : null,
          message: typeof event.error === 'string' ? event.error : null,
        },
      };

    case 'stopped':
      return { ...state, phase: 'stopped' };

    default:
      return state;
  }
}

/** Whether a turn has reached a terminal phase (no more events expected). */
export function isTerminalPhase(phase: ConversePhase): boolean {
  return phase === 'complete' || phase === 'error' || phase === 'stopped';
}
