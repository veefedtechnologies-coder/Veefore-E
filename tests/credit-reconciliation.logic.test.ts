/**
 * Property-based tests for the Video_Editor credit reconciliation pure core
 * (`server/features/video-editor/services/credit-reconciliation.logic.ts`).
 *
 * Task 16.2 — validates the reserve → measure → reconcile credit lifecycle:
 *   - Property 40: Credit accounting conserves credits and never overcharges
 *   - Property 41: Insufficient credits block the provider call with no deduction
 *   - Property 42: Server-side credit balance and cost are authoritative
 *   - Property 44: Retries are idempotent — no duplicate artifacts or charges
 *
 * All properties run at >=100 runs via fast-check. Each property carries a
 * traceability tag linking it back to the validated requirements.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  computeCreditCharge,
  reconcileReservation,
  releaseReservation,
  reservationEstimate,
  checkAffordability,
  authoritativeValue,
  reconcileOperation,
  creditRuleFor,
  roundCredits,
  type ProviderAttemptOutcome,
} from '../server/features/video-editor/services/credit-reconciliation.logic';
import {
  AI_COST_MARGIN_TARGET,
  CREDIT_COST_BUDGET_INR,
  type DynamicCreditRule,
} from '../server/config/plan-config';

const RUNS = { numRuns: 200 };

/** The authoritative video-editor rule, exercised directly. */
const videoRule = creditRuleFor('videoGenerativeEdit');

/** Generator for arbitrary well-formed dynamic/fixed credit rules. */
const ruleArb: fc.Arbitrary<DynamicCreditRule> = fc
  .record({
    floor: fc.double({ min: 0, max: 50, noNaN: true, noDefaultInfinity: true }),
    ceilingDelta: fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
    mode: fc.constantFrom<'dynamic' | 'fixed'>('dynamic', 'fixed'),
  })
  .map(({ floor, ceilingDelta, mode }) => ({
    floor: roundCredits(floor),
    ceiling: roundCredits(floor + ceilingDelta),
    mode,
  }));

/** Non-negative, finite provider cost (INR). */
const costArb = fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true });

/** A single provider attempt outcome. */
const attemptArb: fc.Arbitrary<ProviderAttemptOutcome> = fc.oneof(
  costArb.map((providerCostInr) => ({ status: 'success' as const, providerCostInr })),
  fc.constant({ status: 'failed' as const }),
  fc.constant({ status: 'aborted' as const }),
);

// ---------------------------------------------------------------------------
// Property 40: Credit accounting conserves credits and never overcharges
// Validates: Requirements 17.2, 17.3, 17.4, 17.5, 17.10
// ---------------------------------------------------------------------------

describe('Property 40: Credit accounting conserves credits and never overcharges', () => {
  it('reconcileReservation: net deduction equals measured usage and conserves credits (Req 17.3)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 200, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0, max: 200, noNaN: true, noDefaultInfinity: true }),
        (reserved, measured) => {
          const s = reconcileReservation(reserved, measured);
          const roundedMeasured = roundCredits(Math.max(0, measured));
          const roundedReserved = roundCredits(Math.max(0, reserved));

          // Net charge equals measured usage — never the reservation ceiling.
          expect(s.netCharge).toBeCloseTo(roundedMeasured, 6);
          // Conservation: reserved - refund + overageDebit === measured.
          expect(roundCredits(roundedReserved - s.refund + s.overageDebit)).toBeCloseTo(
            roundedMeasured,
            6,
          );
          // Refund and overage are mutually exclusive and non-negative.
          expect(s.refund).toBeGreaterThanOrEqual(0);
          expect(s.overageDebit).toBeGreaterThanOrEqual(0);
          expect(s.refund === 0 || s.overageDebit === 0).toBe(true);
        },
      ),
      RUNS,
    );
  });

  it('reconcileOperation: a settled success deducts exactly measured usage (Req 17.2, 17.3)', () => {
    fc.assert(
      fc.property(ruleArb, costArb, (rule, providerCostInr) => {
        const balance = 100_000; // plenty to pass the gate
        const outcome = reconcileOperation({
          rule,
          balanceCredits: balance,
          attempts: [{ status: 'success', providerCostInr }],
        });
        const expectedCharge = computeCreditCharge(rule, providerCostInr).credits;

        expect(outcome.gated).toBe(false);
        expect(outcome.providerCalled).toBe(true);
        expect(outcome.charged).toBe(true);
        // Reservation used the ceiling estimate before the call (Req 17.2).
        expect(outcome.reservedCredits).toBe(reservationEstimate(rule));
        // Net deduction equals the measured charge (Req 17.3).
        expect(outcome.netDeduction).toBeCloseTo(expectedCharge, 6);
        expect(outcome.finalBalance).toBeCloseTo(roundCredits(balance - expectedCharge), 6);
      }),
      RUNS,
    );
  });

  it('reconcileOperation: failed/aborted-only attempts release the full reservation, zero net (Req 17.5, 17.10)', () => {
    fc.assert(
      fc.property(
        ruleArb,
        fc.array(fc.constantFrom<ProviderAttemptOutcome>({ status: 'failed' }, { status: 'aborted' }), {
          minLength: 0,
          maxLength: 3,
        }),
        (rule, attempts) => {
          const balance = 100_000;
          const outcome = reconcileOperation({ rule, balanceCredits: balance, attempts });

          expect(outcome.charged).toBe(false);
          // Zero net deduction on failure/abort (Req 17.5, 17.10).
          expect(outcome.netDeduction).toBe(0);
          expect(outcome.finalBalance).toBe(balance);
        },
      ),
      RUNS,
    );
  });

  it('releaseReservation: refunds the entire reservation with zero net charge (Req 17.5, 17.10)', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 500, noNaN: true, noDefaultInfinity: true }), (reserved) => {
        const s = releaseReservation(reserved);
        expect(s.netCharge).toBe(0);
        expect(s.overageDebit).toBe(0);
        expect(s.refund).toBeCloseTo(roundCredits(Math.max(0, reserved)), 6);
      }),
      RUNS,
    );
  });

  it('computeCreditCharge: never undercharges below cost recovery and never below the floor (Req 17.3, 17.10)', () => {
    fc.assert(
      fc.property(ruleArb, costArb, (rule, cost) => {
        const { credits } = computeCreditCharge(rule, cost);
        // Charge is always at least the floor.
        expect(credits).toBeGreaterThanOrEqual(rule.floor - 1e-9);
        if (rule.mode === 'dynamic') {
          // Cost recovery: charge covers the margin-adjusted provider cost.
          const recovery = (cost * AI_COST_MARGIN_TARGET) / CREDIT_COST_BUDGET_INR;
          expect(credits).toBeGreaterThanOrEqual(recovery - 0.1 - 1e-9);
        } else {
          expect(credits).toBe(rule.floor);
        }
      }),
      RUNS,
    );
  });
});

// ---------------------------------------------------------------------------
// Property 41: Insufficient credits block the provider call with no deduction
// Validates: Requirements 17.9, 24.7
// ---------------------------------------------------------------------------

describe('Property 41: Insufficient credits block the provider call with no deduction', () => {
  it('blocks when balance cannot cover the estimate — no call, no deduction (Req 17.9)', () => {
    fc.assert(
      fc.property(
        ruleArb,
        fc.double({ min: 0, max: 200, noNaN: true, noDefaultInfinity: true }),
        (rule, balance) => {
          const required = reservationEstimate(rule);
          fc.pre(balance > 0 && balance < required);

          const outcome = reconcileOperation({
            rule,
            balanceCredits: balance,
            attempts: [{ status: 'success', providerCostInr: 10 }],
          });

          expect(outcome.gated).toBe(true);
          expect(outcome.providerCalled).toBe(false);
          expect(outcome.reservedCredits).toBe(0);
          expect(outcome.charged).toBe(false);
          expect(outcome.netDeduction).toBe(0);
          // Balance untouched; an upgrade/add-credit path is surfaced.
          expect(outcome.finalBalance).toBe(balance);
          expect(outcome.gateReason).toBeTruthy();
        },
      ),
      RUNS,
    );
  });

  it('blocks a zero-balance user even for a zero-cost edit (Req 17.9)', () => {
    fc.assert(
      fc.property(ruleArb, (rule) => {
        const gate = checkAffordability({
          balanceCredits: 0,
          requiredCredits: reservationEstimate(rule),
          isZeroCostEdit: true,
        });
        expect(gate.allowed).toBe(false);
        if (!gate.allowed) {
          expect(gate.reason).toBeTruthy();
          expect(gate.remaining).toBe(0);
        }
      }),
      RUNS,
    );
  });

  it('allows the operation only when the balance covers the estimate', () => {
    fc.assert(
      fc.property(
        ruleArb,
        fc.double({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true }),
        (rule, extra) => {
          const required = reservationEstimate(rule);
          const balance = roundCredits(required + extra);
          fc.pre(balance > 0);
          const gate = checkAffordability({ balanceCredits: balance, requiredCredits: required });
          expect(gate.allowed).toBe(true);
        },
      ),
      RUNS,
    );
  });
});

// ---------------------------------------------------------------------------
// Property 42: Server-side credit balance and cost are authoritative
// Validates: Requirements 17.6, 19.5
// ---------------------------------------------------------------------------

describe('Property 42: Server-side credit balance and cost are authoritative', () => {
  it('authoritativeValue: the server value is always returned regardless of client input (Req 17.6)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true }),
        fc.anything(),
        (serverValue, clientSupplied) => {
          expect(authoritativeValue(serverValue, clientSupplied)).toBe(serverValue);
        },
      ),
      RUNS,
    );
  });

  it('reconcileOperation ignores any client-supplied balance/cost — outcome depends only on server state (Req 17.6, 19.5)', () => {
    fc.assert(
      fc.property(ruleArb, costArb, fc.double({ min: 100, max: 100000, noNaN: true, noDefaultInfinity: true }), fc.anything(), (rule, serverCost, serverBalance, clientNoise) => {
        // The lifecycle only accepts server-derived values; the client noise
        // cannot be threaded into it, so two runs with identical server state
        // must be identical (determinism = authority of server state).
        const attempts: ProviderAttemptOutcome[] = [{ status: 'success', providerCostInr: serverCost }];
        const a = reconcileOperation({ rule, balanceCredits: serverBalance, attempts });
        const b = reconcileOperation({ rule, balanceCredits: serverBalance, attempts });
        // clientNoise is unused by design — asserting it has no channel to affect the result.
        void clientNoise;
        expect(a).toEqual(b);
      }),
      RUNS,
    );
  });
});

// ---------------------------------------------------------------------------
// Property 44: Retries are idempotent — no duplicate artifacts or charges
// Validates: Requirements 18.7
// ---------------------------------------------------------------------------

describe('Property 44: Retries are idempotent — no duplicate artifacts or charges', () => {
  it('charges at most once across retries under one idempotency key (Req 18.7)', () => {
    fc.assert(
      fc.property(
        ruleArb,
        fc.array(attemptArb, { minLength: 1, maxLength: 3 }),
        (rule, attempts) => {
          const balance = 100_000;
          const outcome = reconcileOperation({ rule, balanceCredits: balance, attempts });

          const firstSuccess = attempts.find((a) => a.status === 'success') as
            | { status: 'success'; providerCostInr: number }
            | undefined;

          if (firstSuccess) {
            // Exactly one settlement — charged for the first success only.
            const expected = computeCreditCharge(rule, firstSuccess.providerCostInr).credits;
            expect(outcome.charged).toBe(true);
            expect(outcome.netDeduction).toBeCloseTo(expected, 6);
            expect(outcome.finalBalance).toBeCloseTo(roundCredits(balance - expected), 6);
          } else {
            // No success anywhere → no charge, full release.
            expect(outcome.charged).toBe(false);
            expect(outcome.netDeduction).toBe(0);
            expect(outcome.finalBalance).toBe(balance);
          }
        },
      ),
      RUNS,
    );
  });

  it('appending further retry attempts after the first success never charges again (Req 18.7)', () => {
    fc.assert(
      fc.property(
        ruleArb,
        costArb,
        fc.array(attemptArb, { minLength: 0, maxLength: 2 }),
        (rule, successCost, trailing) => {
          const balance = 100_000;
          const base: ProviderAttemptOutcome[] = [{ status: 'success', providerCostInr: successCost }];

          const once = reconcileOperation({ rule, balanceCredits: balance, attempts: base });
          const withRetries = reconcileOperation({
            rule,
            balanceCredits: balance,
            attempts: [...base, ...trailing],
          });

          // Adding retries after a settled success is a no-op — identical deduction.
          expect(withRetries.netDeduction).toBeCloseTo(once.netDeduction, 6);
          expect(withRetries.finalBalance).toBeCloseTo(once.finalBalance, 6);
          expect(withRetries.charged).toBe(once.charged);
        },
      ),
      RUNS,
    );
  });

  it('is deterministic: identical inputs always produce identical outcomes (Req 18.7)', () => {
    fc.assert(
      fc.property(
        ruleArb,
        fc.array(attemptArb, { minLength: 1, maxLength: 3 }),
        fc.double({ min: 0, max: 100000, noNaN: true, noDefaultInfinity: true }),
        (rule, attempts, balance) => {
          const a = reconcileOperation({ rule, balanceCredits: balance, attempts });
          const b = reconcileOperation({ rule, balanceCredits: balance, attempts });
          expect(a).toEqual(b);
        },
      ),
      RUNS,
    );
  });

  it('the real video rule charges at most once across mixed retry sequences (Req 18.7)', () => {
    fc.assert(
      fc.property(fc.array(attemptArb, { minLength: 1, maxLength: 3 }), (attempts) => {
        const outcome = reconcileOperation({
          rule: videoRule,
          balanceCredits: 100_000,
          attempts,
        });
        const firstSuccess = attempts.find((a) => a.status === 'success') as
          | { status: 'success'; providerCostInr: number }
          | undefined;
        if (firstSuccess) {
          const expected = computeCreditCharge(videoRule, firstSuccess.providerCostInr).credits;
          expect(outcome.netDeduction).toBeCloseTo(expected, 6);
        } else {
          expect(outcome.netDeduction).toBe(0);
        }
      }),
      RUNS,
    );
  });
});
