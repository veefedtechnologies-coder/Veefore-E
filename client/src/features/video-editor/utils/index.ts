/**
 * Video Editor (client) — utils.
 *
 * Client helpers for the editor surface. Pure, side-effect-free modules
 * (gating, attached-source parsing, NDJSON splitting, event reduction, job
 * progress interpretation) are tested in isolation.
 */

export { resolveVideoEditorGate } from './gating';
export type { ResolveVideoEditorGateInput } from './gating';
export { parseAttachedSource } from './attachedSource';

export { splitNdjson, flushNdjson, createNdjsonParser } from './ndjson';
export type { NdjsonSplitResult } from './ndjson';

export {
  reduceConverseEvent,
  initialConverseTurnState,
  isTerminalPhase,
} from './converseEvents';
export type {
  ConverseEvent,
  ConversePlanOperation,
  ConverseRoutedOperation,
  ConverseOutcome,
  ConversePhase,
  ConverseTurnState,
} from './converseEvents';

export {
  CONFIRMATION_TIMEOUT_MS,
  parseCreditEstimateEvent,
  initialCreditEstimateState,
  confirmationDeadlineMs,
  confirmationRemainingMs,
  isConfirmationExpired,
  canConfirm,
  formatCredits,
  formatSeconds,
} from './creditEstimate';
export type {
  CreditEstimate,
  CreditUpgradePath,
  CreditEstimateAffordability,
  CreditConfirmationStatus,
  CreditEstimateState,
  CreditEstimateEventPayload,
} from './creditEstimate';

export {
  interpretJobStatus,
  isTerminalJobState,
  JOB_STATE_LABELS,
  TERMINAL_JOB_STATES,
} from './jobProgress';
export type { JobStatusPayload, JobStreamEvent, JobStatusView } from './jobProgress';

export {
  VIDEO_EDITOR_API_BASE,
  unwrapEnvelope,
  videoEditorRequest,
  streamNdjson,
} from './videoEditorApi';
export type { StreamNdjsonOptions } from './videoEditorApi';
