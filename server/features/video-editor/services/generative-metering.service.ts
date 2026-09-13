/**
 * Generative metering integration (task 16.3, Req 17.1–17.10).
 *
 * The IO-bearing shell that wires the authoritative ledger
 * (`aiCreditMeteringService.runMetered`) around every generative video provider
 * call, and enforces the pre-execution credit gate. It owns NO credit
 * arithmetic of its own (Req 17.1 — "SHALL NOT create a separate credit
 * accounting system"): estimate/charge math comes from the pure
 * `credit-reconciliation.logic` core (task 16.1), reserve→measure→reconcile and
 * at-most-once idempotency come from `runMetered`, and only the orchestration
 * that neither can own lives here:
 *
 *   1. Pre-execution estimate + affordability gate (Req 17.6, 17.7, 17.9). The
 *      server-side balance is read from the ledger (`ensureCreditAccount`, so a
 *      client-supplied balance is never trusted — Req 17.6) and the pure
 *      `checkAffordability` decides whether the operation may proceed. When it
 *      cannot, the operation is BLOCKED before any provider call with an
 *      upgrade/add-credit path and no deduction (Req 17.9).
 *
 *   2. Confirmation with a 300 s timeout (Req 17.7, 17.8). The estimate is
 *      presented and confirmation required; if it is not given within 300 s the
 *      operation is cancelled with no provider call and no deduction (Req 17.8).
 *
 *   3. Metered execution (Req 17.1–17.5, 17.10). The provider call is wrapped in
 *      `runMetered('videoGenerativeEdit', 'video.generation', ctx, op,
 *      measuredSeconds × costPerOutputSecondInr, signal)`, which reserves the
 *      estimate before the call (Req 17.2), reconciles to measured usage
 *      (Req 17.3), charges at most once across retries via the idempotency key
 *      (Req 17.4), and releases the full reservation with no net deduction on
 *      failure or abort (Req 17.5, 17.10). The caller's `AbortSignal` is
 *      forwarded so a mid-flight Stop (or a mid-flight insufficient-credit
 *      detection) aborts the provider communication and releases the reservation
 *      within 5 s (Req 17.10).
 *
 * For a duration-aligned generative edit the output duration equals the affected
 * segment duration (Req 9.12), so `outputSeconds` — the measured billable
 * duration — is known before the call and drives `additionalProviderCostInr`
 * exactly as the design's metering sketch specifies. Video is billed by output
 * seconds, not tokens (design "Research Notes"), so `costPerOutputSecondInr`
 * comes from the provider's capability record (Req 7.1).
 */

import { logger as defaultLogger } from '../../../config/logger';
import type { AICreditFeature } from '../../../config/plan-config';
import {
  aiCreditMeteringService,
  type CreditSettlement,
} from '../../../features/subscription/services/AICreditMeteringService';
import {
  checkAffordability,
  computeCreditCharge,
  creditRuleFor,
  reservationEstimate,
  type AffordabilityResult,
} from './credit-reconciliation.logic';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** The credit feature every generative video edit is metered under (task 1.2). */
export const VIDEO_GENERATIVE_CREDIT_FEATURE: AICreditFeature = 'videoGenerativeEdit';

/** The usage feature tag for token/usage accounting on generative video calls. */
export const VIDEO_GENERATION_USAGE_FEATURE = 'video.generation';

/**
 * The maximum time a presented credit estimate may await user confirmation
 * before the operation is cancelled with no provider call and no deduction
 * (Req 17.8). 300 seconds per the requirement; injectable for tests.
 */
export const CONFIRMATION_TIMEOUT_MS = 300_000;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Identity + idempotency for one metered generative operation. */
export interface MeteringContextInput {
  /** Owning user (server-side identity; balance/cost are server-authoritative). */
  userId: string;
  /** Owning workspace, when applicable. */
  workspaceId?: string;
  /**
   * The operation's idempotency key (typically `job.idempotencyKey`). Reused
   * across retries so the operation is charged at most once (Req 17.4).
   */
  idempotencyKey: string;
}

/**
 * The measured cost basis for a generative video operation. For a
 * duration-aligned edit `outputSeconds` equals the affected segment duration and
 * is known before the call; `costPerOutputSecondInr` comes from the selected
 * provider's capability record (Req 7.1).
 */
export interface GenerativeCostBasis {
  /** Billable measured output duration in seconds (segment/output length). */
  outputSeconds: number;
  /** The provider capability record's per-output-second INR rate. */
  costPerOutputSecondInr: number;
}

/** The credit estimate presented to the user before execution (Req 17.7). */
export interface CreditEstimate {
  feature: AICreditFeature;
  /** Billable output seconds the estimate is based on. */
  outputSeconds: number;
  /** Provider per-second INR rate the estimate is based on. */
  costPerOutputSecondInr: number;
  /** Server-side measured provider cost in INR (`outputSeconds × rate`). */
  providerCostInr: number;
  /** Credits the measured usage is expected to resolve to (presented figure). */
  estimatedCredits: number;
  /** Credits reserved before the provider call — the ceiling (Req 17.2). */
  reservationCredits: number;
}

/** The upgrade/add-credit path surfaced when an operation is blocked (Req 17.9). */
export interface UpgradePath {
  type: 'upgrade_or_add_credits';
  message: string;
  actions: ReadonlyArray<'upgrade_plan' | 'add_credits'>;
}

/** Outcome of the pure pre-execution affordability gate (Req 17.6, 17.9). */
export type GateOutcome =
  | { allowed: true; estimate: CreditEstimate; balanceCredits: number }
  | {
      allowed: false;
      estimate: CreditEstimate;
      balanceCredits: number;
      reason: string;
      required: number;
      remaining: number;
      upgradePath: UpgradePath;
    };

/** Why a metered operation ended without a provider call / charge. */
export type CancellationCause =
  | 'confirmation_timeout'
  | 'confirmation_declined'
  | 'aborted';

/** The result of {@link VideoGenerativeMeteringService.runGenerativeOperation}. */
export type GenerativeRunResult<T> =
  | {
      status: 'completed';
      result: T;
      settlement: CreditSettlement;
      estimate: CreditEstimate;
    }
  | {
      status: 'blocked';
      estimate: CreditEstimate;
      reason: string;
      required: number;
      remaining: number;
      upgradePath: UpgradePath;
    }
  | { status: 'cancelled'; cause: CancellationCause; estimate: CreditEstimate };

/** A confirmation callback: resolves true to proceed, false to decline (Req 17.7). */
export type ConfirmationRequester = (
  estimate: CreditEstimate,
  signal?: AbortSignal,
) => Promise<boolean>;

/** Inputs to a full metered generative operation. */
export interface RunGenerativeInput<T> {
  context: MeteringContextInput;
  cost: GenerativeCostBasis;
  /** The server-side provider call (its `AbortSignal` is forwarded, Req 17.10). */
  operation: (signal?: AbortSignal) => Promise<T>;
  /**
   * Presents the estimate and awaits confirmation (Req 17.7). When omitted the
   * estimate is auto-confirmed — callers that must gate on human confirmation
   * (interactive edits) MUST supply this; background/system flows may omit it.
   */
  confirm?: ConfirmationRequester;
  /** Caller abort signal (Stop / mid-flight insufficient credits, Req 17.10). */
  signal?: AbortSignal;
  /** True when the requested edit is zero-cost (affects zero-balance gating, Req 17.9). */
  isZeroCostEdit?: boolean;
}

/**
 * The minimal ledger surface this service depends on — a structural subset of
 * `aiCreditMeteringService` so tests can inject a fake without a real Redis /
 * MongoDB / provider.
 */
export interface MeteringLedger {
  ensureCreditAccount(userId: string): Promise<number>;
  runMetered<T>(
    feature: AICreditFeature,
    usageFeature: string,
    ctx: { userId: string; workspaceId?: string; idempotencyKey?: string },
    operation: (signal?: AbortSignal) => Promise<T>,
    additionalProviderCostInr?: number,
    signal?: AbortSignal,
  ): Promise<{ result: T; settlement: CreditSettlement }>;
}

/** Injectable dependencies (defaulted for production, overridable for tests). */
export interface VideoGenerativeMeteringDeps {
  ledger?: MeteringLedger;
  logger?: Pick<typeof defaultLogger, 'info' | 'warn' | 'error' | 'debug'>;
  /** Confirmation timeout in ms (defaults to {@link CONFIRMATION_TIMEOUT_MS}). */
  confirmationTimeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** An AbortError whose name lets callers detect a cancellation cleanly. */
function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' || /abort|cancel/i.test(error.message))
  );
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Wires `runMetered` and the pre-execution credit gate around generative video
 * provider calls (task 16.3, Req 17.1–17.10).
 */
export class VideoGenerativeMeteringService {
  private readonly ledger: MeteringLedger;
  private readonly log: VideoGenerativeMeteringDeps['logger'];
  private readonly confirmationTimeoutMs: number;

  constructor(deps: VideoGenerativeMeteringDeps = {}) {
    this.ledger = deps.ledger ?? aiCreditMeteringService;
    this.log = deps.logger ?? defaultLogger;
    this.confirmationTimeoutMs = deps.confirmationTimeoutMs ?? CONFIRMATION_TIMEOUT_MS;
  }

  // -------------------------------------------------------------------------
  // Estimation (Req 17.7)
  // -------------------------------------------------------------------------

  /**
   * Compute the credit estimate for a generative operation from the pure core's
   * single-source charge math (Req 17.1 — no separate accounting). The
   * `providerCostInr` is the server-measured `outputSeconds × rate`; the
   * `estimatedCredits` is what that measured usage resolves to; the
   * `reservationCredits` is the ceiling reserved before the call (Req 17.2).
   */
  estimate(cost: GenerativeCostBasis): CreditEstimate {
    const rule = creditRuleFor(VIDEO_GENERATIVE_CREDIT_FEATURE);
    const outputSeconds = Math.max(0, Number.isFinite(cost.outputSeconds) ? cost.outputSeconds : 0);
    const rate = Math.max(
      0,
      Number.isFinite(cost.costPerOutputSecondInr) ? cost.costPerOutputSecondInr : 0,
    );
    const providerCostInr = outputSeconds * rate;
    const charge = computeCreditCharge(rule, providerCostInr);
    return {
      feature: VIDEO_GENERATIVE_CREDIT_FEATURE,
      outputSeconds,
      costPerOutputSecondInr: rate,
      providerCostInr: charge.providerCostInr,
      estimatedCredits: charge.credits,
      reservationCredits: reservationEstimate(rule),
    };
  }

  // -------------------------------------------------------------------------
  // Pre-execution gating (Req 17.6, 17.9)
  // -------------------------------------------------------------------------

  /**
   * Decide whether a generative operation may proceed, using the SERVER-side
   * balance (Req 17.6) and the pure `checkAffordability` gate (Req 17.9). The
   * operation is gated on the reservation ceiling (what `runMetered` reserves
   * before the call), so an allowed operation can always reserve without an
   * immediate insufficient-credit failure. On a block, an upgrade/add-credit
   * path is returned and NO provider call is made and NO credits are deducted.
   */
  async gate(
    userId: string,
    estimate: CreditEstimate,
    isZeroCostEdit = false,
  ): Promise<GateOutcome> {
    const balanceCredits = await this.ledger.ensureCreditAccount(userId);
    const result: AffordabilityResult = checkAffordability({
      balanceCredits,
      requiredCredits: estimate.reservationCredits,
      isZeroCostEdit,
    });

    if (result.allowed) {
      return { allowed: true, estimate, balanceCredits };
    }

    return {
      allowed: false,
      estimate,
      balanceCredits,
      reason: result.reason,
      required: result.required,
      remaining: result.remaining,
      upgradePath: {
        type: 'upgrade_or_add_credits',
        message: result.reason,
        actions: ['upgrade_plan', 'add_credits'],
      },
    };
  }

  // -------------------------------------------------------------------------
  // Confirmation with 300 s timeout (Req 17.7, 17.8)
  // -------------------------------------------------------------------------

  /**
   * Present the estimate and await confirmation, racing it against the 300 s
   * timeout (Req 17.8) and the caller's abort signal (Req 17.10). Resolves:
   *   - `'confirmed'`            — the user confirmed;
   *   - `'declined'`             — the user declined;
   *   - `'confirmation_timeout'` — no answer within the timeout;
   *   - `'aborted'`              — the caller aborted while awaiting.
   * No provider call is made and no credits are deducted for any non-confirmed
   * outcome.
   */
  private async awaitConfirmation(
    confirm: ConfirmationRequester,
    estimate: CreditEstimate,
    signal?: AbortSignal,
  ): Promise<'confirmed' | 'declined' | 'confirmation_timeout' | 'aborted'> {
    if (signal?.aborted) return 'aborted';

    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;

    try {
      const timeout = new Promise<'confirmation_timeout'>((resolve) => {
        timer = setTimeout(() => resolve('confirmation_timeout'), this.confirmationTimeoutMs);
        // Never keep the event loop alive solely for this timer.
        (timer as { unref?: () => void }).unref?.();
      });

      const aborted = new Promise<'aborted'>((resolve) => {
        if (!signal) return;
        onAbort = () => resolve('aborted');
        signal.addEventListener('abort', onAbort, { once: true });
      });

      const confirmed = Promise.resolve(confirm(estimate, signal))
        .then((ok) => (ok ? ('confirmed' as const) : ('declined' as const)))
        .catch(() => 'declined' as const);

      return await Promise.race([confirmed, timeout, aborted]);
    } finally {
      if (timer) clearTimeout(timer);
      if (signal && onAbort) signal.removeEventListener('abort', onAbort);
    }
  }

  // -------------------------------------------------------------------------
  // Full metered execution (Req 17.1–17.5, 17.10)
  // -------------------------------------------------------------------------

  /**
   * Run one generative provider call end-to-end under the authoritative ledger:
   * estimate → gate → confirm → metered execute. Returns a discriminated result
   * describing whether it completed, was blocked (insufficient credits), or was
   * cancelled (timeout / decline / abort). A `completed` result carries the
   * ledger settlement (net charge = measured usage, Req 17.3); every other
   * result guarantees no provider call proceeded to a charge and no net
   * deduction occurred.
   */
  async runGenerativeOperation<T>(input: RunGenerativeInput<T>): Promise<GenerativeRunResult<T>> {
    const { context, cost, operation, confirm, signal, isZeroCostEdit = false } = input;
    const estimate = this.estimate(cost);

    // Already cancelled before anything happened — no call, no deduction.
    if (signal?.aborted) {
      return { status: 'cancelled', cause: 'aborted', estimate };
    }

    // (1) Pre-execution affordability gate (Req 17.6, 17.9).
    const gate = await this.gate(context.userId, estimate, isZeroCostEdit);
    if (!gate.allowed) {
      this.log?.info?.('Generative video operation blocked: insufficient credits', {
        component: 'VideoGenerativeMeteringService',
        userId: context.userId,
        workspaceId: context.workspaceId,
        required: gate.required,
        remaining: gate.remaining,
      });
      return {
        status: 'blocked',
        estimate,
        reason: gate.reason,
        required: gate.required,
        remaining: gate.remaining,
        upgradePath: gate.upgradePath,
      };
    }

    // (2) Present estimate + require confirmation with a 300 s timeout (Req 17.7, 17.8).
    if (confirm) {
      const decision = await this.awaitConfirmation(confirm, estimate, signal);
      if (decision !== 'confirmed') {
        const cause: CancellationCause =
          decision === 'declined' ? 'confirmation_declined' : decision;
        this.log?.info?.('Generative video operation not confirmed', {
          component: 'VideoGenerativeMeteringService',
          userId: context.userId,
          workspaceId: context.workspaceId,
          cause,
        });
        // No provider call, no deduction (Req 17.8).
        return { status: 'cancelled', cause, estimate };
      }
    }

    // Re-check abort between confirmation and reservation (Req 17.10).
    if (signal?.aborted) {
      return { status: 'cancelled', cause: 'aborted', estimate };
    }

    // (3) Metered execution: reserve → call → reconcile, at-most-once, with
    // full release on failure/abort (Req 17.1–17.5, 17.10). The signal is
    // forwarded so a mid-flight Stop aborts the provider call and refunds.
    const additionalProviderCostInr = estimate.providerCostInr;
    try {
      const { result, settlement } = await this.ledger.runMetered<T>(
        VIDEO_GENERATIVE_CREDIT_FEATURE,
        VIDEO_GENERATION_USAGE_FEATURE,
        {
          userId: context.userId,
          workspaceId: context.workspaceId,
          idempotencyKey: context.idempotencyKey,
        },
        operation,
        additionalProviderCostInr,
        signal,
      );
      return { status: 'completed', result, settlement, estimate };
    } catch (error) {
      // An abort mid-flight already released the reservation inside runMetered
      // (Req 17.10) — surface it as a clean cancellation rather than an error.
      if (isAbortError(error)) {
        this.log?.info?.('Generative video operation aborted mid-flight; reservation released', {
          component: 'VideoGenerativeMeteringService',
          userId: context.userId,
          workspaceId: context.workspaceId,
        });
        return { status: 'cancelled', cause: 'aborted', estimate };
      }
      // Any other failure also released the reservation inside runMetered
      // (Req 17.5); propagate the real error to the caller.
      throw error;
    }
  }
}

/** Lazily-instantiated shared metering-integration service. */
let sharedService: VideoGenerativeMeteringService | null = null;

/** Get the process-wide generative metering service (task 16.3). */
export function getVideoGenerativeMeteringService(): VideoGenerativeMeteringService {
  if (!sharedService) {
    sharedService = new VideoGenerativeMeteringService();
  }
  return sharedService;
}
