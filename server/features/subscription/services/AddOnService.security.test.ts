/**
 * Security regression tests for AddOnService.addAddOn.
 *
 * These pin the two revenue-critical invariants that were previously violated:
 *
 *  1. One-time AI credit packs are PREPAID. They must never be granted without
 *     a confirmed payment. Previously `POST /api/v2/subscription/addon/add`
 *     with `{addonType:'ai_credits_5000', quantity:100}` minted 500,000 credits
 *     for free (quantity is client-supplied).
 *
 *  2. The `requiredMinPlan` gate must be enforced before any purchase work, so
 *     a Free user cannot obtain a Business-tier add-on.
 *
 * The 402 gate throws before any repository/Razorpay call is reached, so these
 * run with stubbed collaborators and need no database or network.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AddOnService } from './AddOnService';
import { ADDON_CONFIG, type AddOnType } from '../../../config/plan-config';

/** Add-on types that are one-time prepaid packs (priceOneTime set). */
const ONE_TIME_TYPES = (Object.keys(ADDON_CONFIG) as AddOnType[]).filter(
  t => ADDON_CONFIG[t].priceOneTime !== null
);

function makeService(plan = 'business') {
  const entitlementService = {
    getPlan: vi.fn().mockResolvedValue(plan),
    invalidateCache: vi.fn().mockResolvedValue(undefined),
  };
  const redis = {} as never;
  const service = new AddOnService(entitlementService as never, redis);
  return { service, entitlementService };
}

describe('AddOnService — one-time credit packs require a confirmed payment', () => {
  beforeEach(() => vi.clearAllMocks());

  it('exposes at least one one-time pack (guards the fixture itself)', () => {
    expect(ONE_TIME_TYPES.length).toBeGreaterThan(0);
  });

  it.each(ONE_TIME_TYPES)(
    'rejects unpaid grant of %s with HTTP 402',
    async addonType => {
      const { service } = makeService();

      await expect(service.addAddOn('user_1', addonType, 1)).rejects.toThrow(
        /must be paid for/i
      );
    }
  );

  it('attaches statusCode 402 so the API returns Payment Required', async () => {
    const { service } = makeService();

    await service.addAddOn('user_1', 'ai_credits_500', 1).then(
      () => {
        throw new Error('expected addAddOn to reject');
      },
      (err: NodeJS.ErrnoException & { statusCode?: number }) => {
        expect(err.statusCode).toBe(402);
      }
    );
  });

  it('blocks the high-quantity amplification case', async () => {
    // The original hole scaled linearly with a client-supplied quantity:
    // 5000 credits x 100 = 500,000 free credits in a single request.
    const { service } = makeService();

    await expect(
      service.addAddOn('user_1', 'ai_credits_5000', 100)
    ).rejects.toThrow(/must be paid for/i);
  });

  it('does not touch the entitlement cache when a grant is refused', async () => {
    // A refused purchase must be a no-op — no cache churn, no partial writes.
    const { service, entitlementService } = makeService();

    await expect(
      service.addAddOn('user_1', 'ai_credits_500', 1)
    ).rejects.toThrow();

    expect(entitlementService.invalidateCache).not.toHaveBeenCalled();
  });

  it('rejects an unknown add-on type', async () => {
    const { service } = makeService();

    await expect(
      service.addAddOn('user_1', 'not_a_real_addon' as AddOnType, 1)
    ).rejects.toThrow(/unknown add-on type/i);
  });
});

describe('AddOnService — requiredMinPlan gate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('denies a plan-gated add-on to a free user with HTTP 403', async () => {
    // follow_campaign_500 requires 'creator' or above per ADDON_CONFIG.
    expect(ADDON_CONFIG.follow_campaign_500.requiredMinPlan).toBe('creator');

    const { service } = makeService('free');

    await service.addAddOn('user_1', 'follow_campaign_500', 1).then(
      () => {
        throw new Error('expected addAddOn to reject');
      },
      (err: NodeJS.ErrnoException & { statusCode?: number }) => {
        expect(err.statusCode).toBe(403);
        expect(String(err.message)).toMatch(/requires the/i);
      }
    );
  });

  it('denies a business-tier add-on to a creator user', async () => {
    expect(ADDON_CONFIG.white_label_reports.requiredMinPlan).toBe('business');

    const { service } = makeService('creator');

    await expect(
      service.addAddOn('user_1', 'white_label_reports', 1)
    ).rejects.toThrow(/requires the/i);
  });

  it('evaluates the plan gate before doing any purchase work', async () => {
    const { service, entitlementService } = makeService('free');

    await expect(
      service.addAddOn('user_1', 'follow_campaign_500', 1)
    ).rejects.toThrow();

    expect(entitlementService.getPlan).toHaveBeenCalledWith('user_1');
    expect(entitlementService.invalidateCache).not.toHaveBeenCalled();
  });
});

describe('ADDON_CONFIG integrity', () => {
  it('every add-on has exactly one pricing mode (recurring XOR one-time)', () => {
    // A malformed entry with both/neither price would either be unbillable or
    // fall through the one-time gate into the recurring branch.
    for (const [type, def] of Object.entries(ADDON_CONFIG)) {
      const hasRecurring = def.priceMonthly !== null;
      const hasOneTime = def.priceOneTime !== null;
      expect(
        hasRecurring !== hasOneTime,
        `${type} must define exactly one of priceMonthly / priceOneTime`
      ).toBe(true);
    }
  });

  it('no add-on is priced at or below zero', () => {
    for (const [type, def] of Object.entries(ADDON_CONFIG)) {
      const price = def.priceMonthly ?? def.priceOneTime;
      expect(price, `${type} price must be positive`).toBeGreaterThan(0);
    }
  });

  it('one-time packs grant a positive credit increment', () => {
    for (const type of ONE_TIME_TYPES) {
      expect(
        ADDON_CONFIG[type].quantityIncrement,
        `${type} must grant credits`
      ).toBeGreaterThan(0);
    }
  });
});
