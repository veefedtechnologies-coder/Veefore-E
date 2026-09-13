/**
 * Video Editor (client) — credit-estimate confirmation model (pure).
 *
 * Before a generative operation executes, the server computes the credit
 * estimate for it and streams it to the client as an `estimate` event on the
 * conversational-turn NDJSON stream (see `converseEvents.ts`). The client MUST
 * present that SERVER-COMPUTED estimate and require explicit user confirmation
 * before the operation proceeds (Req 17.7); if the user does not confirm within
 * 300 s the operation is cancelled with no provider call and no deduction
 * (Req 17.8); and if the balance cannot cover the estimate the operation is
 * blocked with an upgrade/add-credit path and no deduction (Req 17.9).
 *
 * This module owns the CLIENT-facing types and the pure decision helpers for
 * that flow. It holds NO credit arithmetic of its own (Req 17.6 — the balance
 * and cost are server-authoritative; the client only renders and gates on what
 * the server sends). Kept side-effect-free (no React, no I/O, no `Date.now`
 * inside the pure functions — the caller supplies `now`) so the confirmation
 * lifecycle is unit- and property-testable in isolation.
 */

/**
 * The maximum time a presented credit estimate may await user confirmation
 * before the operation is cancelled with no provider call and no deduction
 * (Req 17.8). Mirrors the server's `CONFIRMATION_TIMEOUT_MS`.
 */
export const CONFIRMATION_TIMEOUT_MS = 300_000;

/**
 * The server-computed credit estimate for a generative operation (Req 17.7).
 * Mirrors the server's `CreditEstimate` (`generative-metering.service.ts`); the
 * client treats every figure as authoritative and never recomputes it.
 */
export interface CreditEstimate {
  /** Credit feature the estimate is metered under (e.g. 'videoGenerativeEdit'). */
  feature: string | null;
  /** Billable output seconds the estimate is based on. */
  outputSeconds: number;
  /** Provider per-output-second INR rate the estimate is based on. */
  costPerOutputSecondInr: number;
  /** Server-measured provider cost in INR (`outputSeconds × rate`). */
  providerCostInr: number;
  /** Credits the measured usage is expected to resolve to (the presented figure). */
  estimatedCredits: number;
  /** Credits reserved before the provider call — the ceiling (Req 17.2). */
  reservationCredits: number;
}

/** The upgrade/add-credit path surfaced when an operation is blocked (Req 17.9). */
export interface CreditUpgradePath {
  type: string;
  message: string;
  actions: string[];
}

/**
 * Server-authoritative affordability of the estimate against the user's balance
 * (Req 17.6, 17.9). `affordable === false` means the operation MUST be blocked
 * (no confirm, no provider call) and the `upgradePath` presented.
 */
export interface CreditEstimateAffordability {
  /** The server-side credit balance at estimate time (authoritative, Req 17.6). */
  balanceCredits: number | null;
  /** Whether the balance can cover the reservation (Req 17.9). */
  affordable: boolean;
  /** Why the operation is blocked, when it is (Req 17.9). */
  reason: string | null;
  /** The upgrade/add-credit path to present when blocked (Req 17.9). */
  upgradePath: CreditUpgradePath | null;
}

/**
 * Where a presented estimate is in its confirmation lifecycle:
 *  - `pending`   — awaiting the user's explicit confirmation (Req 17.7).
 *  - `confirmed` — the user confirmed; the operation may proceed.
 *  - `declined`  — the user declined; cancelled, no provider call (Req 17.8).
 *  - `expired`   — the 300 s window elapsed; cancelled, no provider call (Req 17.8).
 *  - `blocked`   — the balance cannot cover the estimate; no confirm (Req 17.9).
 */
export type CreditConfirmationStatus =
  | 'pending'
  | 'confirmed'
  | 'declined'
  | 'expired'
  | 'blocked';

/** A presented estimate plus its confirmation lifecycle state. */
export interface CreditEstimateState {
  estimate: CreditEstimate;
  affordability: CreditEstimateAffordability;
  status: CreditConfirmationStatus;
  /** Epoch ms when the estimate was presented to the user (client receipt). */
  presentedAtMs: number | null;
  /** The confirmation window in ms (Req 17.8). */
  timeoutMs: number;
}

/** The raw `estimate` event payload as streamed by the server (all optional). */
export interface CreditEstimateEventPayload {
  feature?: string;
  outputSeconds?: number;
  costPerOutputSecondInr?: number;
  providerCostInr?: number;
  estimatedCredits?: number;
  reservationCredits?: number;
  balanceCredits?: number;
  affordable?: boolean;
  reason?: string;
  upgradePath?: { type?: string; message?: string; actions?: unknown } | null;
  /** Server-supplied confirmation window override (defaults to 300 s). */
  confirmationTimeoutMs?: number;
}

/** A finite, non-negative number or `0` (never NaN/±Infinity/negative). */
function nonNegative(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value;
}

/** Normalize the server-sent upgrade path, or `null` when absent/malformed. */
function normalizeUpgradePath(raw: CreditEstimateEventPayload['upgradePath']): CreditUpgradePath | null {
  if (!raw || typeof raw !== 'object') return null;
  const actions = Array.isArray(raw.actions)
    ? raw.actions.filter((a): a is string => typeof a === 'string')
    : [];
  return {
    type: typeof raw.type === 'string' ? raw.type : 'upgrade_or_add_credits',
    message: typeof raw.message === 'string' ? raw.message : '',
    actions,
  };
}

/**
 * Parse a raw server `estimate` payload into the client model. The `estimate`
 * figures are required (a payload missing both cost figures is not a usable
 * estimate and yields `null` so the reducer ignores it — a forward-compatible,
 * No-Mock stance: the client never fabricates a cost). Affordability defaults to
 * affordable when the server does not say otherwise, since the blocking decision
 * is server-authoritative and is only surfaced when explicitly sent (Req 17.6).
 */
export function parseCreditEstimateEvent(
  payload: CreditEstimateEventPayload,
): { estimate: CreditEstimate; affordability: CreditEstimateAffordability } | null {
  if (!payload || typeof payload !== 'object') return null;

  const hasCredits =
    typeof payload.estimatedCredits === 'number' && Number.isFinite(payload.estimatedCredits);
  const hasReservation =
    typeof payload.reservationCredits === 'number' && Number.isFinite(payload.reservationCredits);
  // A usable estimate must carry at least one authoritative credit figure.
  if (!hasCredits && !hasReservation) return null;

  const estimatedCredits = nonNegative(payload.estimatedCredits);
  const reservationCredits = hasReservation ? nonNegative(payload.reservationCredits) : estimatedCredits;

  const estimate: CreditEstimate = {
    feature: typeof payload.feature === 'string' ? payload.feature : null,
    outputSeconds: nonNegative(payload.outputSeconds),
    costPerOutputSecondInr: nonNegative(payload.costPerOutputSecondInr),
    providerCostInr: nonNegative(payload.providerCostInr),
    estimatedCredits,
    reservationCredits,
  };

  const balanceCredits =
    typeof payload.balanceCredits === 'number' && Number.isFinite(payload.balanceCredits)
      ? payload.balanceCredits
      : null;

  const affordability: CreditEstimateAffordability = {
    balanceCredits,
    // Server-authoritative: blocked only when the server explicitly says so.
    affordable: payload.affordable !== false,
    reason: typeof payload.reason === 'string' ? payload.reason : null,
    upgradePath: normalizeUpgradePath(payload.upgradePath),
  };

  return { estimate, affordability };
}

/**
 * Build the initial presented-estimate state. `status` is derived from
 * affordability: an unaffordable estimate is `blocked` (no confirm path); an
 * affordable one is `pending` (awaiting confirmation, Req 17.7).
 */
export function initialCreditEstimateState(
  estimate: CreditEstimate,
  affordability: CreditEstimateAffordability,
  presentedAtMs: number | null,
  timeoutMs: number = CONFIRMATION_TIMEOUT_MS,
): CreditEstimateState {
  return {
    estimate,
    affordability,
    status: affordability.affordable ? 'pending' : 'blocked',
    presentedAtMs,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : CONFIRMATION_TIMEOUT_MS,
  };
}

/** The epoch-ms deadline by which the estimate must be confirmed, or `null`. */
export function confirmationDeadlineMs(state: CreditEstimateState): number | null {
  if (state.presentedAtMs == null) return null;
  return state.presentedAtMs + state.timeoutMs;
}

/** Milliseconds left to confirm at `now`, clamped to ≥ 0 (0 when unknown/elapsed). */
export function confirmationRemainingMs(state: CreditEstimateState, now: number): number {
  const deadline = confirmationDeadlineMs(state);
  if (deadline == null) return state.timeoutMs;
  return Math.max(0, deadline - now);
}

/**
 * Whether a still-pending estimate's confirmation window has elapsed at `now`
 * (Req 17.8). Only a `pending` estimate can expire — a confirmed/declined/
 * blocked one has already resolved.
 */
export function isConfirmationExpired(state: CreditEstimateState, now: number): boolean {
  if (state.status !== 'pending') return false;
  const deadline = confirmationDeadlineMs(state);
  if (deadline == null) return false;
  return now >= deadline;
}

/** Whether the user may confirm this estimate right now (pending + affordable). */
export function canConfirm(state: CreditEstimateState): boolean {
  return state.status === 'pending' && state.affordability.affordable;
}

/** Format a credit figure for display (compact, up to 2 decimals). */
export function formatCredits(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(safe);
}

/** Format an output-seconds figure for display (up to 1 decimal). */
export function formatSeconds(value: number): string {
  const safe = Number.isFinite(value) && value > 0 ? value : 0;
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(safe);
}
