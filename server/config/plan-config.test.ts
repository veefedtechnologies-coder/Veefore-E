/**
 * Pricing integrity tests for PLAN_CONFIG — the single source of truth for what
 * customers are charged.
 *
 * Every paid flow (v2 subscription create/upgrade, renewal webhooks, the
 * captured-amount cross-check) derives its amount from this table. A silent edit
 * here changes real charges, so the canonical prices are pinned explicitly
 * rather than computed, and the structural invariants the billing code relies on
 * are asserted.
 *
 * Canonical prices are documented in Docs_Veefore/Pricing_Plans.md and
 * Veefore_Subscription_Plans_v1.md.
 */

import { describe, it, expect } from 'vitest';
import {
  PLAN_CONFIG,
  isValidPlan,
  getPlanOrder,
  type PlanId,
} from './plan-config';

/** Pinned canonical prices, in paise. Changing these changes what users pay. */
const EXPECTED_PRICING: Record<PlanId, { monthly: number; yearly: number }> = {
  free: { monthly: 0, yearly: 0 },
  creator: { monthly: 79900, yearly: 799900 },
  pro: { monthly: 199900, yearly: 1999900 },
  business: { monthly: 499900, yearly: 4999900 },
  // Enterprise is negotiated off-platform; placeholder zeros are intentional.
  enterprise: { monthly: 0, yearly: 0 },
};

/** Pinned monthly AI credit allocations. -1 = unlimited/custom. */
const EXPECTED_CREDITS: Record<PlanId, number> = {
  free: 50,
  creator: 500,
  pro: 2000,
  business: 5000,
  enterprise: -1,
};

const ALL_PLANS = Object.keys(EXPECTED_PRICING) as PlanId[];
const PAID_PLANS: PlanId[] = ['creator', 'pro', 'business'];

describe('PLAN_CONFIG — canonical prices are pinned', () => {
  it.each(ALL_PLANS)('%s has the expected monthly/yearly price', plan => {
    expect(PLAN_CONFIG[plan].pricing.monthly).toBe(
      EXPECTED_PRICING[plan].monthly
    );
    expect(PLAN_CONFIG[plan].pricing.yearly).toBe(
      EXPECTED_PRICING[plan].yearly
    );
  });

  it.each(ALL_PLANS)('%s has the expected monthly AI credits', plan => {
    expect(PLAN_CONFIG[plan].limits.aiCreditsPerMonth).toBe(
      EXPECTED_CREDITS[plan]
    );
  });

  it('defines exactly the expected set of plans', () => {
    // A new plan added without updating the pins above would otherwise ship
    // unreviewed pricing.
    expect(Object.keys(PLAN_CONFIG).sort()).toEqual([...ALL_PLANS].sort());
  });
});

describe('PLAN_CONFIG — structural invariants relied on by billing code', () => {
  it('every plan id matches its map key', () => {
    for (const [key, cfg] of Object.entries(PLAN_CONFIG)) {
      expect(cfg.id, `PLAN_CONFIG.${key}.id must equal its key`).toBe(key);
    }
  });

  it('prices are non-negative integers (paise, never floats)', () => {
    // Razorpay rejects fractional paise; a float here becomes a failed charge.
    for (const plan of ALL_PLANS) {
      const { monthly, yearly } = PLAN_CONFIG[plan].pricing;
      expect(Number.isInteger(monthly)).toBe(true);
      expect(Number.isInteger(yearly)).toBe(true);
      expect(monthly).toBeGreaterThanOrEqual(0);
      expect(yearly).toBeGreaterThanOrEqual(0);
    }
  });

  it('the free plan is genuinely free', () => {
    expect(PLAN_CONFIG.free.pricing.monthly).toBe(0);
    expect(PLAN_CONFIG.free.pricing.yearly).toBe(0);
  });

  it.each(PAID_PLANS)('%s costs more than zero', plan => {
    expect(PLAN_CONFIG[plan].pricing.monthly).toBeGreaterThan(0);
    expect(PLAN_CONFIG[plan].pricing.yearly).toBeGreaterThan(0);
  });

  it.each(PAID_PLANS)('%s yearly is cheaper than 12x monthly', plan => {
    // The UI advertises a yearly discount; if this inverts we would be charging
    // more for the annual commitment than for 12 monthly cycles.
    const { monthly, yearly } = PLAN_CONFIG[plan].pricing;
    expect(yearly).toBeLessThan(monthly * 12);
  });

  it('paid tiers increase monotonically in price', () => {
    const prices = PAID_PLANS.map(p => PLAN_CONFIG[p].pricing.monthly);
    const sorted = [...prices].sort((a, b) => a - b);
    expect(prices).toEqual(sorted);
  });

  it('paid tiers increase monotonically in AI credits', () => {
    const credits = PAID_PLANS.map(
      p => PLAN_CONFIG[p].limits.aiCreditsPerMonth
    );
    const sorted = [...credits].sort((a, b) => a - b);
    expect(credits).toEqual(sorted);
  });
});

describe('isValidPlan — gatekeeper for client-supplied plan ids', () => {
  it.each(ALL_PLANS)('accepts the known plan %s', plan => {
    expect(isValidPlan(plan)).toBe(true);
  });

  it.each([
    'starter', // exists only in the stale legacy pricing table
    'STARTER',
    'Creator', // case-sensitive on purpose
    'admin',
    '',
    'free ',
    '__proto__',
    'constructor',
  ])('rejects the invalid plan id %o', bogus => {
    // `planId` arrives as a free-form string from the client (Zod uses
    // z.string()), so this function is the real boundary. Prototype-chain keys
    // must not be treated as plans.
    expect(isValidPlan(bogus)).toBe(false);
  });
});

describe('getPlanOrder — powers upgrade/downgrade and add-on gating', () => {
  it('orders free below every paid plan', () => {
    for (const plan of PAID_PLANS) {
      expect(getPlanOrder('free')).toBeLessThan(getPlanOrder(plan));
    }
  });

  it('ranks creator < pro < business', () => {
    expect(getPlanOrder('creator')).toBeLessThan(getPlanOrder('pro'));
    expect(getPlanOrder('pro')).toBeLessThan(getPlanOrder('business'));
  });
});
