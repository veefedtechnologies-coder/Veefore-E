/**
 * Credit reconciliation — pure (DB-free, IO-free) model of the
 * reserve → measure → reconcile credit lifecycle for the Video_Editor
 * (Req 17.2, 17.3, 17.4, 17.5, 17.6, 17.9, 17.10).
 *
 * The authoritative implementation lives in the existing
 * `AICreditMeteringService` (`server/features/subscription/services/AICreditMeteringService.ts`),
 * whose `runMetered` performs, for every generative operation:
 *
 *   estimate  (`CREDIT_MODEL[feature].ceiling`)
 *     → reserve   (atomic pre-call debit of the ceiling)
 *       → execute (`operation(signal)` raced against abort)
 *         → measure (`computeCreditCharge` from token usage + `additionalProviderCostInr`)
 *           → reconcile (`adjustReservation`: refund ceiling→measured, or debit an overage),
 *   idempotent at-most-once via a per-operation idempotency key, with a FULL
 *   reservation release (zero net) on failure or abort.
 *
 * This module is the deterministic decision/arithmetic *core* of that lifecycle,
 * kept pure and side-effect-free so it can be exercised by property tests
 * (`credit-reconciliation.logic.test.ts`, task 16.2) without Redis, MongoDB, or a
 * provider — matching the `veegpt-*.logic.ts` / `*.logic.ts` convention. Task
 * 16.3 wires the real `aiCreditMeteringService.runMetered(...)` around it; this
 * core mirrors its semantics exactly and reuses the SAME single-source constants
 * (`CREDIT_MODEL`, `AI_COST_MARGIN_TARGET`, `CREDIT_COST_BUDGET_INR`) so the two
 * can never drift.
 *
 * The invariants enforced structurally here (design §"Credit Metering
 * Integration", Properties 40–42, 44):
 *
 *   1. Net deduction equals measured usage (Req 17.3). A completed operation's
 *      net credit deduction equals the credits computed from the MEASURED
 *      provider cost — never the reservation ceiling.
 *   2. Full release on failure/abort with zero net (Req 17.5, 17.10). A provider
 *      call that fails or is aborted without a settled success releases the
 *      entire reservation; the net deduction is exactly zero.
 *   3. At-most-once under an idempotency key (Req 17.4). Across any number of
 *      retries, at most one settlement is recorded and the operation is charged
 *      at most once — later attempts are no-ops.
 *   4. Server-side balance/cost authoritative (Req 17.6). Gating and settlement
 *      use only server-derived values; a client-supplied balance or cost has no
 *      effect (see {@link authoritativeValue}).
 *   5. Insufficient-credit gating (Req 17.9). When the balance cannot cover the
 *      estimate — or is zero even for a zero-cost edit — the operation is blocked
 *      BEFORE any provider call and nothing is deducted.
 */

import {
  AI_COST_MARGIN_TARGET,
  CREDIT_COST_BUDGET_INR,
  CREDIT_MODEL,
  type AICreditFeature,
  type DynamicCreditRule,
} from '../../../config/plan-config';

// ---------------------------------------------------------------------------
// Rounding — mirrors AICreditMeteringService.roundCredits exactly
// ---------------------------------------------------------------------------

/**
 * Round a credit amount to 2 decimal places, matching the ledger's
 * `roundCredits` (`AICreditMeteringService`). Using the identical rounding keeps
 * this pure core's arithmetic bit-for-bit consistent with the authoritative
 * settlement path.
 */
export function roundCredits(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Charge computation — mirrors AICreditMeteringService.computeCreditCharge
// ---------------------------------------------------------------------------

/** The credits and provider cost (INR) a charge resolves to. */
export interface CreditCharge {
  /** Credits to deduct for this charge (already rounded to 2 dp). */
  credits: number;
  /** The (server-side) provider cost in INR the charge was derived from. */
  providerCostInr: number;
}

/**
 * Resolve the {@link DynamicCreditRule} for a video-editor credit feature from
 * the single-source `CREDIT_MODEL`. Kept as a helper so callers never inline a
 * rule and the credit model stays authoritative.
 */
export function creditRuleFor(feature: AICreditFeature): DynamicCreditRule {
  return CREDIT_MODEL[feature];
}

/**
 * Compute the credits for a given measured provider cost, mirroring
 * `AICreditMeteringService.computeCreditCharge` exactly:
 *
 *   - `fixed` rules always charge the floor.
 *   - `dynamic` rules apply the cost-recovery margin over the credit budget,
 *     round the dynamic amount UPWARD to 0.1 (so cost recovery is never weakened
 *     by rounding), then take `max(floor, dynamic)`. The `ceiling` is only a
 *     pre-call reservation estimate — a measured overage above it is charged in
 *     full rather than clamped below cost.
 *
 * `providerCostInr` is the server-measured cost (for video, measured output
 * seconds × the capability record's per-second INR rate, passed through
 * `additionalProviderCostInr` in the real path). Negative inputs are floored to
 * zero, matching the ledger's `Math.max(0, additionalProviderCostInr)`.
 *
 * Pure and total: never throws, never performs IO.
 */
export function computeCreditCharge(
  rule: DynamicCreditRule,
  providerCostInr: number,
): CreditCharge {
  const cost = Math.max(0, Number.isFinite(providerCostInr) ? providerCostInr : 0);
  if (rule.mode === 'fixed') {
    return { credits: rule.floor, providerCostInr: cost };
  }
  const raw = (cost * AI_COST_MARGIN_TARGET) / CREDIT_COST_BUDGET_INR;
  const dynamic = Math.ceil(raw * 10) / 10;
  return {
    credits: roundCredits(Math.max(rule.floor, dynamic)),
    providerCostInr: cost,
  };
}

/**
 * The credits reserved before the provider call (Req 17.2). Mirrors the ledger,
 * which reserves `CREDIT_MODEL[feature].ceiling` as the pre-call estimate.
 */
export function reservationEstimate(rule: DynamicCreditRule): number {
  return rule.ceiling;
}

// ---------------------------------------------------------------------------
// Authoritative-source guard (Req 17.6, Property 42)
// ---------------------------------------------------------------------------

/**
 * Return the SERVER-side value, ignoring any client-supplied value entirely
 * (Req 17.6, Property 42). Gating and settlement must derive balance and cost
 * from server state; a client-supplied number can never change the outcome. The
 * `_clientSupplied` parameter exists only to make that guarantee explicit and
 * testable — it is deliberately unused.
 */
export function authoritativeValue(serverValue: number, _clientSupplied?: unknown): number {
  return serverValue;
}

// ---------------------------------------------------------------------------
// Insufficient-credit gating (Req 17.9, Property 41)
// ---------------------------------------------------------------------------

/** Inputs to the pre-execution affordability gate (all server-derived). */
export interface AffordabilityInput {
  /**
   * The user's server-side remaining credit balance. `Infinity` denotes an
   * unlimited (enterprise) balance, mirroring `ensureCreditAccount`.
   */
  balanceCredits: number;
  /** The reservation estimate (ceiling) required before the provider call. */
  requiredCredits: number;
  /**
   * Whether this is a zero-cost edit. A zero balance blocks even a zero-cost
   * edit (Req 17.9: "or the user has zero credits even for a zero-cost edit").
   */
  isZeroCostEdit?: boolean;
}

/** The outcome of the affordability gate. */
export type AffordabilityResult =
  | { allowed: true }
  | { allowed: false; reason: string; required: number; remaining: number };

/**
 * Decide whether a generative operation may proceed to reserve + call the
 * provider (Req 17.9, Property 41). The operation is BLOCKED — with no provider
 * call and no deduction — when either:
 *
 *   - the balance cannot cover the required estimate, or
 *   - the balance is zero (or negative) even for a zero-cost edit.
 *
 * An `Infinity` balance (enterprise) always passes. Pure and total.
 */
export function checkAffordability(input: AffordabilityInput): AffordabilityResult {
  const { balanceCredits, requiredCredits, isZeroCostEdit = false } = input;

  if (balanceCredits === Infinity) return { allowed: true };

  // Zero (or negative) credits block even a zero-cost edit (Req 17.9).
  if (balanceCredits <= 0) {
    return {
      allowed: false,
      reason: isZeroCostEdit
        ? 'Zero credit balance blocks even a zero-cost edit; present an upgrade or add-credit path.'
        : 'Insufficient credits: balance is zero. Present an upgrade or add-credit path.',
      required: Math.max(requiredCredits, 0),
      remaining: balanceCredits,
    };
  }

  if (balanceCredits < requiredCredits) {
    return {
      allowed: false,
      reason: `Insufficient credits: required ${requiredCredits}, remaining ${balanceCredits}. Present an upgrade or add-credit path.`,
      required: requiredCredits,
      remaining: balanceCredits,
    };
  }

  return { allowed: true };
}

// ---------------------------------------------------------------------------
// Reservation reconciliation — mirrors AICreditMeteringService.adjustReservation
// ---------------------------------------------------------------------------

/**
 * The settlement of a reservation against measured usage. Mirrors the three
 * branches of `adjustReservation`:
 *
 *   - `refund > 0`   — the reservation ceiling exceeded measured usage; the
 *     difference is refunded (the common case).
 *   - `overageDebit > 0` — measured usage exceeded the reservation; the extra is
 *     debited (never undercharged below cost).
 *   - both zero      — measured usage equalled the reservation exactly.
 *
 * `netCharge` is always the measured credits — the user's net deduction equals
 * measured actual usage (Req 17.3).
 */
export interface ReconciliationSettlement {
  /** Net credits deducted after reconciliation — equals measured usage (Req 17.3). */
  netCharge: number;
  /** Credits refunded from the reservation (0 when measured ≥ reserved). */
  refund: number;
  /** Extra credits debited beyond the reservation (0 when measured ≤ reserved). */
  overageDebit: number;
}

/**
 * Reconcile a reservation against measured usage so the net deduction equals the
 * measured credits (Req 17.3), mirroring `adjustReservation`. Given
 * `reservedCredits` (the ceiling already debited) and `measuredCredits`:
 *
 *   netCharge   = measuredCredits
 *   refund      = max(0, reserved − measured)
 *   overageDebit = max(0, measured − reserved)
 *
 * so `reserved − refund + overageDebit === measured` always holds. Pure and
 * total; inputs are rounded to keep parity with the ledger.
 */
export function reconcileReservation(
  reservedCredits: number,
  measuredCredits: number,
): ReconciliationSettlement {
  const reserved = roundCredits(Math.max(0, reservedCredits));
  const measured = roundCredits(Math.max(0, measuredCredits));
  const difference = roundCredits(reserved - measured);
  return {
    netCharge: measured,
    refund: difference > 0 ? difference : 0,
    overageDebit: difference < 0 ? roundCredits(-difference) : 0,
  };
}

/**
 * Release a reservation in full with zero net deduction (Req 17.5, 17.10): a
 * provider call that failed or was aborted without a settled success refunds the
 * entire reservation and charges nothing.
 */
export function releaseReservation(reservedCredits: number): ReconciliationSettlement {
  const reserved = roundCredits(Math.max(0, reservedCredits));
  return { netCharge: 0, refund: reserved, overageDebit: 0 };
}

// ---------------------------------------------------------------------------
// Lifecycle model — reserve → execute (with retries) → reconcile
// ---------------------------------------------------------------------------

/**
 * The outcome of one provider attempt within a metered operation. A `success`
 * carries the server-MEASURED provider cost (INR); `failed`/`aborted` incurred
 * no billable provider cost and must release the reservation (Req 17.5, 17.10).
 */
export type ProviderAttemptOutcome =
  | { status: 'success'; providerCostInr: number }
  | { status: 'failed' }
  | { status: 'aborted' };

/** Inputs to the full metered-operation lifecycle simulation. */
export interface ReconciliationInput {
  /** The credit rule for the operation's feature (from `CREDIT_MODEL`). */
  rule: DynamicCreditRule;
  /** The user's server-side balance before reservation (`Infinity` = enterprise). */
  balanceCredits: number;
  /**
   * The ordered attempts made under a SINGLE idempotency key. Retries append
   * further attempts; at most one success is ever settled (Req 17.4,
   * Property 44).
   */
  attempts: readonly ProviderAttemptOutcome[];
  /** Whether the requested edit is zero-cost (affects zero-balance gating). */
  isZeroCostEdit?: boolean;
}

/** The result of the full reserve → execute → reconcile lifecycle. */
export interface ReconciliationOutcome {
  /** True iff the affordability gate blocked the operation before any call (Req 17.9). */
  gated: boolean;
  /** Present when `gated` — the human-readable block reason. */
  gateReason?: string;
  /** True iff a provider call was initiated (false when gated). */
  providerCalled: boolean;
  /** The credits reserved before the call (0 when gated). */
  reservedCredits: number;
  /** True iff exactly one success was settled (a charge exists). */
  charged: boolean;
  /**
   * The net credits deducted after reconciliation — equals measured usage on a
   * settled success, and exactly 0 when gated or when every attempt failed /
   * aborted (Req 17.3, 17.5, 17.10).
   */
  netDeduction: number;
  /** The user's server-side balance after the lifecycle completes. */
  finalBalance: number;
}

/**
 * Simulate the full reserve → execute → reconcile lifecycle for one metered
 * operation under a single idempotency key (design §"Credit Metering
 * Integration"). This is the pure heart of Properties 40, 41, and 44:
 *
 *   1. GATE (Req 17.9). The estimate is checked against the server balance
 *      first; if it cannot be covered (or the balance is zero for a zero-cost
 *      edit) the operation is blocked with no provider call and no deduction.
 *   2. RESERVE (Req 17.2). The ceiling estimate is reserved before any call.
 *   3. EXECUTE + at-most-once SETTLE (Req 17.3, 17.4). Attempts are processed in
 *      order; the FIRST success settles the charge to the measured credits and
 *      every later attempt is a no-op (idempotent — charged at most once). The
 *      reservation is reconciled to measured usage, so the net deduction equals
 *      measured usage.
 *   4. RELEASE (Req 17.5, 17.10). If no attempt succeeds, the full reservation is
 *      released and the net deduction is exactly zero.
 *
 * The function is pure and total: identical inputs always yield an identical
 * outcome, and `Infinity` balances (enterprise) are conserved.
 */
export function reconcileOperation(input: ReconciliationInput): ReconciliationOutcome {
  const { rule, balanceCredits, attempts, isZeroCostEdit = false } = input;
  const reserved = reservationEstimate(rule);

  // (1) Affordability gate — no provider call, no deduction on block (Req 17.9).
  const gate = checkAffordability({
    balanceCredits,
    requiredCredits: reserved,
    isZeroCostEdit,
  });
  if (!gate.allowed) {
    return {
      gated: true,
      gateReason: gate.reason,
      providerCalled: false,
      reservedCredits: 0,
      charged: false,
      netDeduction: 0,
      finalBalance: balanceCredits,
    };
  }

  // (2) Reserve the ceiling estimate before the provider call (Req 17.2).
  const providerCalled = attempts.length > 0;

  // (3) At-most-once settlement: only the first success is charged (Req 17.4).
  const firstSuccess = attempts.find(
    (a): a is { status: 'success'; providerCostInr: number } => a.status === 'success',
  );

  if (firstSuccess) {
    const measured = computeCreditCharge(rule, firstSuccess.providerCostInr).credits;
    // Reconcile reservation → measured; net deduction equals measured (Req 17.3).
    const settlement = reconcileReservation(reserved, measured);
    const finalBalance =
      balanceCredits === Infinity ? Infinity : roundCredits(balanceCredits - settlement.netCharge);
    return {
      gated: false,
      providerCalled: true,
      reservedCredits: reserved,
      charged: true,
      netDeduction: settlement.netCharge,
      finalBalance,
    };
  }

  // (4) No success — release the full reservation, zero net (Req 17.5, 17.10).
  return {
    gated: false,
    providerCalled,
    reservedCredits: reserved,
    charged: false,
    netDeduction: 0,
    finalBalance: balanceCredits,
  };
}
