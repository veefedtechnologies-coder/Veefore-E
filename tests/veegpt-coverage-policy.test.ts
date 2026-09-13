/**
 * Block 5 policy tests — the governance decisions introduced when every AI path
 * was brought under the engine.
 *
 * These are pure-config assertions (no Redis, no Mongo) so they run in CI, and
 * they exist because each one is a decision that could silently regress:
 *
 *  • the anonymous landing demo must have a GLOBAL ceiling, or per-IP limiting
 *    bounds nothing;
 *  • webhook-driven automation intent matching must be capped per period, since
 *    its risk is call volume rather than call size;
 *  • every feature a route now declares must actually exist in the registry,
 *    otherwise it silently falls back to permissive defaults;
 *  • feature caps must be overridable from the environment so a runaway cost can
 *    be clamped without a deploy.
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  AUTOMATION_INTENT_FEATURE,
  DEEP_RESEARCH_FEATURE,
  featureMonthlyCap,
  featureSpec,
  LANDING_DEMO_FEATURE,
  PUBLIC_DEMO_USER_ID,
  UNLIMITED,
} from '../server/config/veegpt-vgu.config';
import { VGUQuotaError } from '../server/services/veegpt-metering';

const ENV_KEYS = [
  'VEEGPT_FEATURE_CAP_LANDING_DEMO_CAPTION',
  'VEEGPT_FEATURE_CAP_LANDING_DEMO_CAPTION_ENTERPRISE',
  'VEEGPT_FEATURE_CAP_AUTOMATION_INTENT',
  'VEEGPT_FEATURE_CAP_AUTOMATION_INTENT_PRO',
];

afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
});

describe('anonymous landing demo', () => {
  it('has a global monthly ceiling, not an unlimited budget', () => {
    // The demo reserves against a synthetic enterprise user precisely so the
    // FEATURE cap is the only binding limit; if that cap were unlimited the
    // endpoint would be unbounded.
    const cap = featureMonthlyCap(LANDING_DEMO_FEATURE, 'enterprise');
    expect(cap).toBeGreaterThan(0);
    expect(cap).not.toBe(UNLIMITED);
  });

  it('bounds a single request and its provider fan-out', () => {
    const spec = featureSpec(LANDING_DEMO_FEATURE);
    expect(spec.maxVGUPerRequest).toBeLessThanOrEqual(5);
    expect(spec.maxProviderCalls).toBe(2);
    expect(spec.maxRetries).toBe(0);
    expect(spec.blocking).toBe(true);
  });

  it('limits concurrent visitors independently of the per-IP limiter', () => {
    // A per-IP limiter does nothing against many IPs; a global concurrency cap
    // does.
    expect(featureSpec(LANDING_DEMO_FEATURE).concurrency).toBeGreaterThan(0);
  });

  it('uses one synthetic quota owner so all visitors share one budget', () => {
    expect(PUBLIC_DEMO_USER_ID).toMatch(/^__/);
  });
});

describe('webhook-driven automation intent matching', () => {
  it('is capped on every plan except enterprise', () => {
    for (const plan of ['free', 'creator', 'pro', 'business'] as const) {
      const cap = featureMonthlyCap(AUTOMATION_INTENT_FEATURE, plan);
      expect(cap).toBeGreaterThan(0);
      expect(cap).not.toBe(UNLIMITED);
    }
    expect(featureMonthlyCap(AUTOMATION_INTENT_FEATURE, 'enterprise')).toBe(
      UNLIMITED
    );
  });

  it('caps rise with the plan', () => {
    const free = featureMonthlyCap(AUTOMATION_INTENT_FEATURE, 'free');
    const creator = featureMonthlyCap(AUTOMATION_INTENT_FEATURE, 'creator');
    const pro = featureMonthlyCap(AUTOMATION_INTENT_FEATURE, 'pro');
    const business = featureMonthlyCap(AUTOMATION_INTENT_FEATURE, 'business');
    expect(free).toBeLessThan(creator);
    expect(creator).toBeLessThan(pro);
    expect(pro).toBeLessThan(business);
  });

  it('blocks when spent, because the keyword fallback still works', () => {
    expect(featureSpec(AUTOMATION_INTENT_FEATURE).blocking).toBe(true);
    expect(featureSpec(AUTOMATION_INTENT_FEATURE).maxProviderCalls).toBe(1);
  });
});

describe('feature caps are tunable without a deploy', () => {
  it('honours a global per-feature override', () => {
    process.env.VEEGPT_FEATURE_CAP_LANDING_DEMO_CAPTION = '42';
    expect(featureMonthlyCap(LANDING_DEMO_FEATURE, 'enterprise')).toBe(42);
  });

  it('lets a per-plan override win over the global one', () => {
    process.env.VEEGPT_FEATURE_CAP_AUTOMATION_INTENT = '100';
    process.env.VEEGPT_FEATURE_CAP_AUTOMATION_INTENT_PRO = '7';
    expect(featureMonthlyCap(AUTOMATION_INTENT_FEATURE, 'pro')).toBe(7);
    expect(featureMonthlyCap(AUTOMATION_INTENT_FEATURE, 'creator')).toBe(100);
  });

  it('treats a negative override as unlimited', () => {
    process.env.VEEGPT_FEATURE_CAP_LANDING_DEMO_CAPTION = '-1';
    expect(featureMonthlyCap(LANDING_DEMO_FEATURE, 'enterprise')).toBe(UNLIMITED);
  });

  it('ignores a non-numeric override rather than disabling the cap', () => {
    process.env.VEEGPT_FEATURE_CAP_LANDING_DEMO_CAPTION = 'lots';
    const cap = featureMonthlyCap(LANDING_DEMO_FEATURE, 'enterprise');
    expect(cap).not.toBe(UNLIMITED);
    expect(Number.isFinite(cap)).toBe(true);
  });
});

describe('every feature a route declares exists in the registry', () => {
  /**
   * The labels used by meterAI across the codebase. An unregistered label falls
   * back to permissive defaults (50 VGU/request, no monthly cap), which is
   * exactly the silent hole this list prevents.
   */
  const DECLARED = [
    'veegpt.chat',
    'veegpt.post_agent',
    'caption.generation',
    'caption.regenerate',
    'hashtag.generation',
    'content.brief',
    'content.repurpose',
    'competitor.analysis',
    'trend.intelligence',
    'growth.recommendations',
    'image.generation',
    'video.generation',
    'video.script',
    'thumbnail.generation',
    'social_listening.extract',
    LANDING_DEMO_FEATURE,
    AUTOMATION_INTENT_FEATURE,
    DEEP_RESEARCH_FEATURE,
  ];

  it('resolves each label to a real spec, not the default fallback', () => {
    const fallback = featureSpec('__definitely_not_a_feature__');
    for (const feature of DECLARED) {
      const spec = featureSpec(feature);
      expect(spec.label, `${feature} is missing from the registry`).not.toBe(
        fallback.label
      );
    }
  });

  it('gives every declared feature a hard per-request ceiling', () => {
    for (const feature of DECLARED) {
      const spec = featureSpec(feature);
      expect(spec.maxVGUPerRequest, feature).toBeGreaterThan(0);
      expect(Number.isFinite(spec.maxVGUPerRequest), feature).toBe(true);
    }
  });

  it('keeps generation features expensive relative to text features', () => {
    // A DALL·E image is a fixed ~$0.04 charge; if its estimate were near a text
    // turn's, image generation would be effectively free until reconciliation.
    expect(featureSpec('image.generation').baseVGU).toBeGreaterThan(
      featureSpec('caption.generation').baseVGU * 5
    );
  });
});

// ---------------------------------------------------------------------------
// The refusal payload the client actually consumes
// ---------------------------------------------------------------------------

describe('structured refusal payload', () => {
  const err = (code: string, extra: Record<string, unknown> = {}) =>
    new VGUQuotaError({
      code: code as never,
      message: 'nope',
      billingPeriodId: 'cal:2026-08',
      estimatedVGU: 3,
      requestedTier: 'premium',
      requestedModel: 'openai-gpt4o',
      ...extra,
    }).toResponse();

  it('offers a cheaper tier ONLY for a model-scoped refusal', () => {
    // A burst or monthly refusal cannot be solved by picking a cheaper model, so
    // suggesting one would send the user in a circle.
    expect(err('MODEL_QUOTA_EXHAUSTED').suggestedTier).toBe('cheap');
    expect(err('MODEL_NOT_IN_PLAN').suggestedTier).toBe('cheap');
    // An abuse tier restriction exists specifically so cheap models keep working,
    // so it must offer the cheaper option too.
    expect(err('ABUSE_TIER_RESTRICTED').suggestedTier).toBe('cheap');
    expect(err('BURST_QUOTA_EXHAUSTED').suggestedTier).toBeUndefined();
    expect(err('MONTHLY_QUOTA_EXHAUSTED').suggestedTier).toBeUndefined();
    expect(err('CONCURRENCY_LIMIT').suggestedTier).toBeUndefined();
    expect(err('WORKSPACE_CONCURRENCY_LIMIT').suggestedTier).toBeUndefined();
    // A full abuse block cannot be worked around by choosing a cheaper model.
    expect(err('ABUSE_DETECTED').suggestedTier).toBeUndefined();
  });

  it('always carries a machine-readable code and the requested model', () => {
    const body = err('MODEL_QUOTA_EXHAUSTED');
    expect(body.code).toBe('MODEL_QUOTA_EXHAUSTED');
    expect(body.requestedModel).toBe('openai-gpt4o');
    expect(body.requestedTier).toBe('premium');
  });

  it('keeps the legacy fields the shipped client reads', () => {
    // Regression guard: the chat client shows its limit notice and Upgrade CTA
    // from `upgrade` and `scope`. Dropping them would silently remove the CTA.
    expect(err('BURST_QUOTA_EXHAUSTED').scope).toBe('session');
    expect(err('MONTHLY_QUOTA_EXHAUSTED').scope).toBe('monthly');
    expect(err('SEAT_SHARE_EXHAUSTED').scope).toBe('monthly');
    expect(err('WORKSPACE_POOL_EXHAUSTED').scope).toBe('monthly');
    expect(err('BURST_QUOTA_EXHAUSTED').upgrade).toBe(true);
  });

  it('surfaces retry timing in both seconds and an absolute instant', () => {
    const body = err('BURST_QUOTA_EXHAUSTED', { retryAfterSec: 600 });
    expect(body.retryAfter).toBe(600);
    expect(typeof body.retryAt).toBe('string');
    expect(new Date(body.retryAt as string).getTime()).toBeGreaterThan(Date.now());
  });

  it('never leaks a silent model substitution', () => {
    // There is no "servedModel" / "downgradedTo" in the payload: the server does
    // not choose for the user, it reports and asks.
    const body = err('MODEL_QUOTA_EXHAUSTED');
    expect(Object.keys(body)).not.toContain('servedModel');
    expect(Object.keys(body)).not.toContain('downgradedTo');
  });
});
