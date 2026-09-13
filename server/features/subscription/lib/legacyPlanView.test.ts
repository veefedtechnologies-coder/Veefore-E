/**
 * Tests for the legacy plan-shape adapter.
 *
 * These pin the two things the legacy endpoints actually got wrong before the
 * migration:
 *   1. credit allowances that disagreed with canonical config (free reported 20
 *      where canonical grants 50), and
 *   2. `upgrade` hints pointing at 'starter' — a plan that no longer exists, so
 *      any client acting on the hint sent users to an unbuyable tier.
 */

import { describe, it, expect } from 'vitest';
import { getLegacyPlanView } from './legacyPlanView';
import { PLAN_CONFIG } from '../../../config/plan-config';

describe('getLegacyPlanView — canonical values, legacy shape', () => {
  it('reports the canonical free credit allowance (50, not the legacy 20)', () => {
    expect(getLegacyPlanView('free').credits).toBe(50);
    expect(getLegacyPlanView('free').credits).toBe(
      PLAN_CONFIG.free.limits.aiCreditsPerMonth
    );
  });

  it.each(['free', 'creator', 'pro', 'business'] as const)(
    '%s credits match canonical config',
    planId => {
      expect(getLegacyPlanView(planId).credits).toBe(
        PLAN_CONFIG[planId].limits.aiCreditsPerMonth
      );
    }
  );

  it('converts prices from paise to rupees', () => {
    const creator = getLegacyPlanView('creator');
    expect(creator.price).toBe(799);
    expect(creator.yearlyPrice).toBe(7999);
  });

  it('exposes the creator tier the legacy table was missing entirely', () => {
    const creator = getLegacyPlanView('creator');
    expect(creator.id).toBe('creator');
    expect(creator.name).toBe('Creator');
    expect(creator.price).toBeGreaterThan(0);
  });

  it('falls back to free for the retired starter tier', () => {
    // 'starter' exists only in the legacy table. Rather than returning
    // undefined (which the old getPlanById did, causing `?.credits || 0`), the
    // adapter degrades to the free plan so callers always get a usable object.
    expect(getLegacyPlanView('starter').id).toBe('free');
  });

  it.each([null, undefined, '', 'bogus', '__proto__'])(
    'falls back to free for invalid plan id %o',
    planId => {
      expect(getLegacyPlanView(planId as string).id).toBe('free');
    }
  );

  it('maps limits from canonical config', () => {
    const business = getLegacyPlanView('business');
    expect(business.limits.workspaces).toBe(
      PLAN_CONFIG.business.limits.maxWorkspaces
    );
    expect(business.limits.socialAccounts).toBe(
      PLAN_CONFIG.business.limits.maxProfiles
    );
    expect(business.limits.teamMembers).toBe(
      PLAN_CONFIG.business.limits.maxTeamMembers
    );
    expect(business.limits.monthlyCredits).toBe(
      PLAN_CONFIG.business.limits.aiCreditsPerMonth
    );
  });
});

describe('getLegacyPlanView — feature gating', () => {
  it('always allows the baseline features on free', () => {
    const free = getLegacyPlanView('free');
    for (const id of [
      'dashboard',
      'content-scheduler',
      'analytics',
      'workspace',
      'social-accounts',
    ]) {
      expect(free.features[id].allowed, `${id} should be allowed on free`).toBe(
        true
      );
    }
  });

  it('locks paid features on free and unlocks them on business', () => {
    const free = getLegacyPlanView('free');
    const business = getLegacyPlanView('business');

    for (const id of ['creative-brief', 'content-repurpose', 'user-persona']) {
      expect(free.features[id].allowed, `${id} locked on free`).toBe(false);
      expect(business.features[id].allowed, `${id} open on business`).toBe(
        true
      );
    }
  });

  it('never suggests upgrading to a plan that does not exist', () => {
    // The legacy table hardcoded `upgrade: 'starter'`. This is the regression
    // that mattered: a client honouring that hint pointed users at an
    // unpurchasable tier.
    const validPlans = new Set(Object.keys(PLAN_CONFIG));
    for (const planId of ['free', 'creator', 'pro'] as const) {
      const view = getLegacyPlanView(planId);
      for (const [featureId, feature] of Object.entries(view.features)) {
        if (feature.upgrade) {
          expect(
            validPlans.has(feature.upgrade),
            `${planId}/${featureId} suggests unknown plan '${feature.upgrade}'`
          ).toBe(true);
          expect(feature.upgrade).not.toBe('starter');
        }
      }
    }
  });

  it('suggests the CHEAPEST plan that unlocks a locked feature', () => {
    const free = getLegacyPlanView('free');
    // Anything gated merely on "is paid" must point at creator, the cheapest
    // paid tier — not pro or business.
    expect(free.features['creative-brief'].upgrade).toBe('creator');
  });

  it('omits the upgrade hint for features that are already allowed', () => {
    const business = getLegacyPlanView('business');
    expect(business.features.dashboard.upgrade).toBeUndefined();
    expect(business.features.dashboard.allowed).toBe(true);
  });

  it('carries numeric limits for the capped features', () => {
    const creator = getLegacyPlanView('creator');
    expect(creator.features['content-scheduler'].limit).toBe(
      PLAN_CONFIG.creator.limits.scheduledPostsPerMonth
    );
    expect(creator.features.workspace.limit).toBe(
      PLAN_CONFIG.creator.limits.maxWorkspaces
    );
    expect(creator.features['social-accounts'].limit).toBe(
      PLAN_CONFIG.creator.limits.maxProfiles
    );
  });

  it('reports the analytics tier as a coarse label', () => {
    expect(getLegacyPlanView('free').features.analytics.limit).toBe('basic');
    expect(getLegacyPlanView('pro').features.analytics.limit).toBe('advanced');
  });

  it('feature access is monotonic across the upgrade ladder', () => {
    // A higher tier must never lose a feature a lower tier had — otherwise an
    // upgrade could appear to downgrade capability.
    const ladder = ['free', 'creator', 'pro', 'business'] as const;
    const views = ladder.map(p => getLegacyPlanView(p));

    for (let i = 1; i < views.length; i++) {
      for (const [featureId, feature] of Object.entries(
        views[i - 1].features
      )) {
        if (feature.allowed) {
          expect(
            views[i].features[featureId].allowed,
            `${ladder[i]} lost '${featureId}' that ${ladder[i - 1]} had`
          ).toBe(true);
        }
      }
    }
  });
});
