import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import {
  CONFIRMATION_TIMEOUT_MS,
  parseCreditEstimateEvent,
  initialCreditEstimateState,
  confirmationDeadlineMs,
  confirmationRemainingMs,
  isConfirmationExpired,
  canConfirm,
  formatCredits,
  formatSeconds,
  type CreditEstimateEventPayload,
} from '../creditEstimate';

/** A well-formed, affordable estimate payload. */
function affordablePayload(overrides: Partial<CreditEstimateEventPayload> = {}): CreditEstimateEventPayload {
  return {
    feature: 'videoGenerativeEdit',
    outputSeconds: 5,
    costPerOutputSecondInr: 2,
    providerCostInr: 10,
    estimatedCredits: 12,
    reservationCredits: 15,
    balanceCredits: 100,
    affordable: true,
    ...overrides,
  };
}

describe('parseCreditEstimateEvent', () => {
  it('parses a well-formed affordable estimate', () => {
    const parsed = parseCreditEstimateEvent(affordablePayload());
    expect(parsed).not.toBeNull();
    expect(parsed!.estimate.estimatedCredits).toBe(12);
    expect(parsed!.estimate.reservationCredits).toBe(15);
    expect(parsed!.estimate.outputSeconds).toBe(5);
    expect(parsed!.affordability.affordable).toBe(true);
    expect(parsed!.affordability.balanceCredits).toBe(100);
  });

  it('returns null when no authoritative credit figure is present (No-Mock)', () => {
    expect(parseCreditEstimateEvent({ feature: 'videoGenerativeEdit', outputSeconds: 5 })).toBeNull();
    expect(parseCreditEstimateEvent({})).toBeNull();
    expect(parseCreditEstimateEvent(undefined as unknown as CreditEstimateEventPayload)).toBeNull();
  });

  it('defaults reservationCredits to estimatedCredits when only one is sent', () => {
    const parsed = parseCreditEstimateEvent({ estimatedCredits: 8 });
    expect(parsed!.estimate.estimatedCredits).toBe(8);
    expect(parsed!.estimate.reservationCredits).toBe(8);
  });

  it('treats the estimate as blocked only when the server explicitly says so (Req 17.6)', () => {
    const blocked = parseCreditEstimateEvent(
      affordablePayload({ affordable: false, reason: 'Insufficient credits', balanceCredits: 3 }),
    );
    expect(blocked!.affordability.affordable).toBe(false);
    expect(blocked!.affordability.reason).toBe('Insufficient credits');

    // Absent `affordable` → affordable (server would send false to block).
    const noFlag = parseCreditEstimateEvent({ estimatedCredits: 5 });
    expect(noFlag!.affordability.affordable).toBe(true);
  });

  it('normalizes an upgrade path and filters non-string actions', () => {
    const parsed = parseCreditEstimateEvent(
      affordablePayload({
        affordable: false,
        upgradePath: {
          type: 'upgrade_or_add_credits',
          message: 'Add credits to continue',
          actions: ['upgrade_plan', 42 as unknown as string, 'add_credits'],
        },
      }),
    );
    expect(parsed!.affordability.upgradePath).toEqual({
      type: 'upgrade_or_add_credits',
      message: 'Add credits to continue',
      actions: ['upgrade_plan', 'add_credits'],
    });
  });

  it('clamps negative / non-finite figures to zero (never fabricates a cost)', () => {
    const parsed = parseCreditEstimateEvent({
      estimatedCredits: -5,
      reservationCredits: Number.NaN,
      outputSeconds: -1,
      providerCostInr: Infinity,
    });
    // reservationCredits was NaN (not usable) but estimatedCredits present → parsed.
    expect(parsed).not.toBeNull();
    expect(parsed!.estimate.estimatedCredits).toBe(0);
    expect(parsed!.estimate.reservationCredits).toBe(0);
    expect(parsed!.estimate.outputSeconds).toBe(0);
    expect(parsed!.estimate.providerCostInr).toBe(0);
  });
});

describe('initialCreditEstimateState', () => {
  it('is pending when affordable and blocked when not', () => {
    const parsed = parseCreditEstimateEvent(affordablePayload())!;
    const pending = initialCreditEstimateState(parsed.estimate, parsed.affordability, 1000);
    expect(pending.status).toBe('pending');
    expect(pending.timeoutMs).toBe(CONFIRMATION_TIMEOUT_MS);

    const blockedParsed = parseCreditEstimateEvent(affordablePayload({ affordable: false }))!;
    const blocked = initialCreditEstimateState(blockedParsed.estimate, blockedParsed.affordability, 1000);
    expect(blocked.status).toBe('blocked');
  });

  it('falls back to the default timeout for a non-positive override', () => {
    const parsed = parseCreditEstimateEvent(affordablePayload())!;
    const state = initialCreditEstimateState(parsed.estimate, parsed.affordability, 0, -1);
    expect(state.timeoutMs).toBe(CONFIRMATION_TIMEOUT_MS);
  });
});

describe('confirmation window (Req 17.8)', () => {
  const parsed = parseCreditEstimateEvent(affordablePayload())!;
  const presentedAt = 10_000;
  const state = initialCreditEstimateState(parsed.estimate, parsed.affordability, presentedAt);

  it('computes the deadline from the presentation time + timeout', () => {
    expect(confirmationDeadlineMs(state)).toBe(presentedAt + CONFIRMATION_TIMEOUT_MS);
  });

  it('reports remaining time clamped to >= 0', () => {
    expect(confirmationRemainingMs(state, presentedAt)).toBe(CONFIRMATION_TIMEOUT_MS);
    expect(confirmationRemainingMs(state, presentedAt + 1000)).toBe(CONFIRMATION_TIMEOUT_MS - 1000);
    expect(confirmationRemainingMs(state, presentedAt + CONFIRMATION_TIMEOUT_MS + 5000)).toBe(0);
  });

  it('expires only a pending estimate once the window elapses', () => {
    expect(isConfirmationExpired(state, presentedAt + CONFIRMATION_TIMEOUT_MS - 1)).toBe(false);
    expect(isConfirmationExpired(state, presentedAt + CONFIRMATION_TIMEOUT_MS)).toBe(true);

    const confirmed = { ...state, status: 'confirmed' as const };
    expect(isConfirmationExpired(confirmed, presentedAt + CONFIRMATION_TIMEOUT_MS + 10_000)).toBe(false);
  });

  it('never expires when the presentation time is unknown', () => {
    const noTime = initialCreditEstimateState(parsed.estimate, parsed.affordability, null);
    expect(confirmationDeadlineMs(noTime)).toBeNull();
    expect(isConfirmationExpired(noTime, Number.MAX_SAFE_INTEGER)).toBe(false);
  });
});

describe('canConfirm', () => {
  it('allows confirming only a pending, affordable estimate', () => {
    const parsed = parseCreditEstimateEvent(affordablePayload())!;
    const pending = initialCreditEstimateState(parsed.estimate, parsed.affordability, 0);
    expect(canConfirm(pending)).toBe(true);
    expect(canConfirm({ ...pending, status: 'confirmed' })).toBe(false);

    const blockedParsed = parseCreditEstimateEvent(affordablePayload({ affordable: false }))!;
    const blocked = initialCreditEstimateState(blockedParsed.estimate, blockedParsed.affordability, 0);
    expect(canConfirm(blocked)).toBe(false);
  });
});

describe('formatters', () => {
  it('formats credits and seconds compactly and safely', () => {
    expect(formatCredits(12)).toBe('12');
    expect(formatCredits(12.345)).toBe('12.35');
    expect(formatCredits(Number.NaN)).toBe('0');
    expect(formatSeconds(5)).toBe('5');
    expect(formatSeconds(5.25)).toBe('5.3');
    expect(formatSeconds(-3)).toBe('0');
  });
});

describe('creditEstimate properties', () => {
  // Feature: veefore-ai-video-editor — the parsed estimate never carries a
  // negative or non-finite figure (No-Mock: the client renders only clean,
  // server-authoritative numbers, Req 17.6).
  it('parsed estimate figures are always finite and non-negative', () => {
    const numArb = fc.oneof(
      fc.double({ noNaN: false }),
      fc.integer({ min: -1000, max: 1000 }),
      fc.constant(Number.NaN),
      fc.constant(Infinity),
      fc.constant(-Infinity),
      fc.constant(undefined),
    );
    fc.assert(
      fc.property(numArb, numArb, numArb, numArb, (credits, reservation, seconds, cost) => {
        const parsed = parseCreditEstimateEvent({
          estimatedCredits: credits as number,
          reservationCredits: reservation as number,
          outputSeconds: seconds as number,
          providerCostInr: cost as number,
        });
        if (parsed === null) return true; // no usable credit figure → ignored
        const e = parsed.estimate;
        for (const v of [e.estimatedCredits, e.reservationCredits, e.outputSeconds, e.providerCostInr]) {
          if (!Number.isFinite(v) || v < 0) return false;
        }
        return true;
      }),
      { numRuns: 300 },
    );
  });

  // Feature: veefore-ai-video-editor — remaining confirmation time is always in
  // [0, timeout] and a pending estimate expires exactly at/after its deadline
  // (Req 17.8).
  it('remaining time stays within [0, timeout] and expiry aligns with the deadline', () => {
    const parsed = parseCreditEstimateEvent(affordablePayload())!;
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 2 * CONFIRMATION_TIMEOUT_MS }),
        (presentedAt, elapsed) => {
          const state = initialCreditEstimateState(parsed.estimate, parsed.affordability, presentedAt);
          const now = presentedAt + elapsed;
          const remaining = confirmationRemainingMs(state, now);
          if (remaining < 0 || remaining > state.timeoutMs) return false;
          const expired = isConfirmationExpired(state, now);
          return expired === elapsed >= state.timeoutMs;
        },
      ),
      { numRuns: 300 },
    );
  });
});
