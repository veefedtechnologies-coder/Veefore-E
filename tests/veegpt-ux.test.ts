/**
 * UX / structured-refusal policy tests (Block 9, spec §28, §42, §43).
 *
 * Pure logic — the usage-warning bands and the refusal payload — so these run on
 * every commit. The client rendering that consumes them is proven by build; the
 * decisions those pixels depend on are pinned here.
 */

import { describe, it, expect } from 'vitest';
import { usageNotice, VGU_ERROR } from '../server/config/veegpt-vgu.config';
import { VGUQuotaError } from '../server/services/veegpt-metering';

describe('usage warning bands (\u00a742)', () => {
  it('stays SILENT below 70% — no "37/1200 VGU" nagging', () => {
    for (const f of [0, 0.1, 0.5, 0.69]) {
      const n = usageNotice(f * 1200, 1200);
      expect(n.band, `${f}`).toBe('none');
      expect(n.message, `${f}`).toBeNull();
    }
  });

  it('uses the spec\u2019s exact wording at each band', () => {
    expect(usageNotice(70, 100).message).toBe("You're using VeeGPT heavily this month.");
    expect(usageNotice(85, 100).message).toBe(
      "You're getting close to your VeeGPT allowance."
    );
    expect(usageNotice(95, 100).message).toBe("You're almost at your monthly VeeGPT limit.");
    expect(usageNotice(100, 100).message).toBe(
      'Your monthly VeeGPT allowance has been reached.'
    );
  });

  it('names the right band at each threshold', () => {
    expect(usageNotice(70, 100).band).toBe('heavy');
    expect(usageNotice(85, 100).band).toBe('approaching');
    expect(usageNotice(95, 100).band).toBe('almost');
    expect(usageNotice(100, 100).band).toBe('reached');
    expect(usageNotice(120, 100).band).toBe('reached'); // over 100% still "reached"
  });

  it('escalates monotonically', () => {
    const order = ['none', 'heavy', 'approaching', 'almost', 'reached'];
    let prev = -1;
    for (let pct = 0; pct <= 110; pct += 2) {
      const rank = order.indexOf(usageNotice(pct, 100).band);
      expect(rank, `${pct}%`).toBeGreaterThanOrEqual(prev);
      prev = rank;
    }
  });

  it('never warns on an unlimited plan — nothing to be close to', () => {
    for (const limit of [0, -1, Number.POSITIVE_INFINITY, NaN]) {
      const n = usageNotice(9_999_999, limit);
      expect(n.band).toBe('none');
      expect(n.message).toBeNull();
    }
  });

  it('carries the fraction so the client can draw its own gauge', () => {
    expect(usageNotice(600, 1200).fraction).toBeCloseTo(0.5, 5);
    expect(usageNotice(1200, 1200).fraction).toBe(1);
  });
});

describe('structured refusal payload (\u00a728, \u00a743)', () => {
  const make = (code: string) =>
    new VGUQuotaError({
      code: code as never,
      message: 'nope',
      billingPeriodId: 'cal:2026-08',
      estimatedVGU: 12,
      requestedTier: 'premium',
      requestedModel: 'openai-gpt4o',
    }).toResponse();

  it('offers "Continue with Fast" ONLY when a cheaper model would help', () => {
    // The whole point of §28: a model-scoped refusal is solvable by dropping to
    // Fast; a burst/monthly one is not, and pretending otherwise sends the user
    // in a circle.
    expect(make(VGU_ERROR.MODEL_QUOTA_EXHAUSTED).suggestedTier).toBe('cheap');
    expect(make(VGU_ERROR.MODEL_NOT_IN_PLAN).suggestedTier).toBe('cheap');
    expect(make(VGU_ERROR.ABUSE_TIER_RESTRICTED).suggestedTier).toBe('cheap');

    expect(make(VGU_ERROR.BURST_QUOTA_EXHAUSTED).suggestedTier).toBeUndefined();
    expect(make(VGU_ERROR.MONTHLY_QUOTA_EXHAUSTED).suggestedTier).toBeUndefined();
    expect(make(VGU_ERROR.CONCURRENCY_LIMIT).suggestedTier).toBeUndefined();
    expect(make(VGU_ERROR.FEATURE_QUOTA_EXHAUSTED).suggestedTier).toBeUndefined();
  });

  it('always carries a machine-readable code and the requested model', () => {
    const body = make(VGU_ERROR.MODEL_QUOTA_EXHAUSTED);
    expect(body.code).toBe('MODEL_QUOTA_EXHAUSTED');
    expect(body.requestedModel).toBe('openai-gpt4o');
    expect(body.upgradeAvailable).toBe(true);
  });

  it('NEVER contains a silently-swapped model — the server asks, it does not decide', () => {
    const body = make(VGU_ERROR.MODEL_QUOTA_EXHAUSTED);
    // The presence of these fields would mean a swap already happened.
    expect(Object.keys(body)).not.toContain('servedModel');
    expect(Object.keys(body)).not.toContain('downgradedTo');
    expect(Object.keys(body)).not.toContain('newModel');
  });

  it('is a 429 with Retry-After timing', () => {
    const err = new VGUQuotaError({
      code: VGU_ERROR.BURST_QUOTA_EXHAUSTED as never,
      message: 'wait',
      retryAfterSec: 600,
      billingPeriodId: 'cal:2026-08',
      estimatedVGU: 1,
      requestedTier: 'cheap',
    });
    expect(err.httpStatus).toBe(429);
    const body = err.toResponse();
    expect(body.retryAfter).toBe(600);
    expect(new Date(body.retryAt as string).getTime()).toBeGreaterThan(Date.now());
  });
});
