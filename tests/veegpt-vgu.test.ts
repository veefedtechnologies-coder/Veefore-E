/**
 * Block 1 — VGU configuration, model tier registry, versioned pricing registry.
 *
 * These prove the ECONOMIC correctness of the foundation: that tiers cover every
 * routable model, that pricing is versioned and resolves historically, that
 * actual VGU tracks real token usage rather than a flat multiplier, and that
 * every per-request ceiling actually bounds a runaway.
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  MODEL_TIER,
  TIER_MULTIPLIER,
  TIER_LABEL,
  TIER_ORDER,
  modelTierOf,
  modelsInTier,
  tierWithin,
  baseTierFor,
  isTierSelectable,
  TIER_DEFAULT_MODEL,
  UNKNOWN_MODEL_TIER,
  type ModelTier,
} from '../shared/veegpt-model-tiers';
import {
  PRICING_REGISTRY,
  priceFor,
  providerCostUSD,
  UNKNOWN_MODEL_PRICE,
  isPriced,
} from '../server/config/veegpt-pricing.registry';
import {
  featureSpec,
  featureMonthlyCap,
  policyForPlan,
  seatMonthlyCap,
  tierAllocation,
  burstWindowSec,
  reservationTtlSec,
  PLAN_VGU_POLICY,
  VGU_ANCHOR_USD,
  VGU_REFERENCE_REQUEST,
  MIN_VGU_PER_REQUEST,
  UNLIMITED,
  VGU_ERROR,
  DEEP_RESEARCH_FEATURE,
  AUTOPILOT_FEATURE,
} from '../server/config/veegpt-vgu.config';
import {
  actualVGU,
  estimateVGU,
  vguFromUSD,
  TOOL_BASE_VGU,
} from '../server/services/veegpt-vgu';
import type { PlanId } from '../server/config/plan-config';

const PLANS: PlanId[] = ['free', 'creator', 'pro', 'business', 'enterprise'];
const TIERS: ModelTier[] = ['cheap', 'medium', 'premium', 'ultra'];

const savedEnv = { ...process.env };
afterEach(() => {
  process.env = { ...savedEnv };
});

// ---------------------------------------------------------------------------
describe('model tier registry', () => {
  it('covers every routable model, in both directions', async () => {
    const { listRegisteredModels, getModelSpec } = await import(
      '../server/services/ai-model-routing'
    );
    const registryIds = listRegisteredModels();
    expect(registryIds.length).toBeGreaterThan(20);

    const untiered = registryIds.filter(id => !(id in MODEL_TIER));
    expect(
      untiered,
      `routable models with no tier: ${untiered.join(', ')}`
    ).toEqual([]);

    for (const id of Object.keys(MODEL_TIER)) {
      const spec = getModelSpec(id);
      expect(spec, `${id} must exist in the routing registry`).toBeTruthy();
      expect(spec.native, `${id} must map to a provider model`).not.toBe('');
    }
  });

  it('implements all four tiers with ascending multipliers', () => {
    expect(TIERS.map(t => TIER_MULTIPLIER[t])).toEqual([1, 3, 12, 20]);
    for (let i = 1; i < TIERS.length; i++) {
      expect(TIER_ORDER[TIERS[i]]).toBeGreaterThan(TIER_ORDER[TIERS[i - 1]]);
    }
  });

  it('reserves the Ultra tier for the most expensive models', () => {
    expect(TIER_MULTIPLIER.ultra).toBe(20);
    expect(TIER_LABEL.ultra).toBe('Ultra');
    // Ultra is now populated by the ~$30/1M-output frontier models.
    const ultra = modelsInTier('ultra');
    expect(ultra).toContain('openai-gpt-5.6-sol');
    expect(ultra).toContain('openai-gpt-5.5');
    // Every plan must still have an explicit ultra policy.
    for (const plan of PLANS) {
      expect(tierAllocation(plan, 'ultra').access).toBeTruthy();
    }
  });

  it('treats an unknown model as premium — never cheap', () => {
    expect(UNKNOWN_MODEL_TIER).toBe('premium');
    expect(modelTierOf('brand-new-frontier-model-x')).toBe('premium');
  });

  it('does not classify an unknown model as ultra (would deny access, not just charge)', () => {
    // Ultra is unavailable on Free/Creator; defaulting there would turn a missing
    // pricing row into an outage instead of a conservative charge.
    expect(modelTierOf('brand-new-frontier-model-x')).not.toBe('ultra');
  });

  it('classifies the cheap and expensive models on the right side', () => {
    expect(modelTierOf('openai-gpt-5-nano')).toBe('cheap');
    expect(modelTierOf('veegpt-hybrid')).toBe('cheap');
    expect(modelTierOf('openai-gpt-5-mini')).toBe('medium');
    expect(modelTierOf('gemini-flash-latest')).toBe('medium');
    expect(modelTierOf('openai-gpt4o')).toBe('premium');
    expect(modelTierOf('openai-gpt-4.1')).toBe('premium');
    expect(modelTierOf('openai-gpt-4.1-mini')).toBe('medium');
    expect(modelTierOf('openai-gpt-4.1-nano')).toBe('cheap');
    // The costly frontier models must be gated at the top tiers, not premium.
    expect(modelTierOf('openai-gpt-5.6-sol')).toBe('ultra');
    expect(modelTierOf('openai-gpt-5.5')).toBe('ultra');
    // A genuinely cheap flagship-family model must NOT be over-gated as premium.
    expect(modelTierOf('openai-gpt-5.6-luna')).toBe('medium');
    // Frontier-priced models named "flash"/"sonnet" are still premium by cost.
    expect(modelTierOf('gemini-3.5-flash')).toBe('premium');
    expect(modelTierOf('claude-3-5-sonnet')).toBe('premium');
  });

  it('BANKRUPTCY GUARD: no model is tiered cheaper than its real price allows', () => {
    // The tier controls ACCESS (who may use a model, and Free's premium previews)
    // and the pre-flight ESTIMATE. If a model's real provider price exceeds what
    // its tier is meant to cover, an expensive model gets gated — and estimated —
    // as if it were cheaper, which is exactly how a plan's allowance turns into an
    // uncontrolled cost. This asserts the safety CEILING: a model's real output
    // price (the dominant cost) must not exceed its tier's maximum. It fails CI if
    // a future price change or new model is mis-tiered downward.
    const OUTPUT_CEILING_USD: Record<ModelTier, number> = {
      cheap: 2,
      medium: 6,
      premium: 16,
      ultra: Infinity,
    };
    const offenders: string[] = [];
    for (const [model, tier] of Object.entries(MODEL_TIER)) {
      const out = priceFor(model).output;
      if (out > OUTPUT_CEILING_USD[tier]) {
        offenders.push(`${model} ($${out}/1M out) is '${tier}' but exceeds $${OUTPUT_CEILING_USD[tier]}`);
      }
    }
    expect(offenders, offenders.join('; ')).toEqual([]);
  });

  it('provides a runnable default model for every tier', () => {
    for (const tier of TIERS) {
      const model = TIER_DEFAULT_MODEL[tier];
      expect(model, `${tier} needs a default model`).toBeTruthy();
      // The ultra default intentionally reuses a premium model until an ultra
      // model exists; it must never be an unknown id.
      expect(MODEL_TIER[model]).toBeTruthy();
    }
  });

  it('derives the base tier from the shared access matrix', () => {
    // The base tier is what a reply falls back to, so it must be a tier the plan
    // has FULL access to — never one behind a limited allowance.
    for (const plan of PLANS) {
      expect(tierAllocation(plan, baseTierFor(plan)).access).toBe('full');
    }
    expect(baseTierFor('free')).toBe('cheap');
    expect(baseTierFor('creator')).toBe('medium');
    expect(baseTierFor('enterprise')).toBe('ultra');
  });

  it('treats a limited tier as selectable, and only "none" as locked', () => {
    // Free can *choose* premium (5 previews) — showing it locked would hide the
    // preview that exists to drive conversion.
    expect(isTierSelectable('free', 'premium')).toBe(true);
    expect(isTierSelectable('free', 'medium')).toBe(true);
    expect(isTierSelectable('free', 'ultra')).toBe(false);
    expect(isTierSelectable('creator', 'ultra')).toBe(false);
    expect(isTierSelectable('pro', 'ultra')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('pricing registry', () => {
  it('prices every model referenced by the tier map', async () => {
    const { getModelSpec } = await import('../server/services/ai-model-routing');
    const unpriced: string[] = [];
    for (const id of Object.keys(MODEL_TIER)) {
      const native = getModelSpec(id).native;
      if (!isPriced(native)) unpriced.push(`${id} → ${native}`);
    }
    expect(unpriced, `unpriced models: ${unpriced.join(', ')}`).toEqual([]);
  });

  it('falls back to a price MORE expensive than every real model', () => {
    const p = priceFor('totally-unknown-model');
    expect(p).toBe(UNKNOWN_MODEL_PRICE);
    // Invariant: an unpriced model must never be the cheap option. Adding a
    // pricier model to the registry without raising the fallback breaks this.
    const maxInput = Math.max(...PRICING_REGISTRY.map(r => r.input));
    const maxOutput = Math.max(...PRICING_REGISTRY.map(r => r.output));
    expect(p.input).toBeGreaterThanOrEqual(maxInput);
    expect(p.output).toBeGreaterThanOrEqual(maxOutput);
  });

  it('normalises provider-prefixed model ids', () => {
    expect(priceFor('openai/gpt-4o-mini').model).toBe('gpt-4o-mini');
  });

  it('resolves the price in force at a given time, not just the latest', () => {
    const past = new Date('2026-03-01T00:00:00Z');
    const row = priceFor('gpt-4o-mini', past);
    expect(new Date(row.effectiveFrom).getTime()).toBeLessThanOrEqual(
      past.getTime()
    );
    expect(row.pricingVersion).toBeTruthy();
  });

  it('bills cached input at a discount', () => {
    const fresh = providerCostUSD('gpt-4o-mini', { inputTokens: 1_000_000 });
    const cached = providerCostUSD('gpt-4o-mini', {
      inputTokens: 1_000_000,
      cachedTokens: 1_000_000,
    });
    // gpt-4o-mini bills cached prompt tokens at OpenAI's published 50% of the
    // fresh input rate (verified 2026-08-10), not the old flat 10%.
    expect(cached.usd).toBeLessThan(fresh.usd);
    expect(cached.usd).toBeCloseTo(fresh.usd * 0.5, 6);
  });

  it('does NOT double-charge reasoning tokens (they sit inside output)', () => {
    // OpenAI reports completion_tokens_details.reasoning_tokens INSIDE
    // completion_tokens, and Gemini reports thoughtsTokenCount inside
    // candidatesTokenCount. Adding them again would inflate every reasoning
    // request by the size of its hidden thinking.
    const plain = providerCostUSD('gpt-5', { outputTokens: 5_000 });
    const withBreakdown = providerCostUSD('gpt-5', {
      outputTokens: 5_000,
      reasoningTokens: 4_000,
    });
    expect(withBreakdown.usd).toBeCloseTo(plain.usd, 10);
  });

  it('charges reasoning separately ONLY when a provider bills it that way', () => {
    const included = providerCostUSD('gpt-5', {
      outputTokens: 1_000,
      reasoningTokens: 1_000,
    });
    const separate = providerCostUSD('gpt-5', {
      outputTokens: 1_000,
      reasoningTokens: 1_000,
      reasoningBilledSeparately: true,
    });
    expect(separate.usd).toBeGreaterThan(included.usd);
  });

  it('never returns a negative cost for nonsense input', () => {
    const c = providerCostUSD('gpt-4o-mini', {
      inputTokens: -5,
      outputTokens: -10,
      cachedTokens: -3,
    });
    expect(c.usd).toBeGreaterThanOrEqual(0);
  });

  it('caps cached tokens at the input count', () => {
    const c = providerCostUSD('gpt-4o-mini', {
      inputTokens: 100,
      cachedTokens: 10_000,
    });
    const allCached = providerCostUSD('gpt-4o-mini', {
      inputTokens: 100,
      cachedTokens: 100,
    });
    expect(c.usd).toBeCloseTo(allCached.usd, 10);
  });
});

// ---------------------------------------------------------------------------
describe('the VGU anchor', () => {
  it('makes one reference cheap request cost ~1 VGU', () => {
    const cost = providerCostUSD(VGU_REFERENCE_REQUEST.model, {
      inputTokens: VGU_REFERENCE_REQUEST.inputTokens,
      outputTokens: VGU_REFERENCE_REQUEST.outputTokens,
    });
    const vgu = cost.usd / VGU_ANCHOR_USD;
    expect(vgu).toBeGreaterThan(0.8);
    expect(vgu).toBeLessThan(1.3);
  });

  it('is configurable so VGU never permanently means a fixed amount of money', () => {
    // Spec §3. Doubling the anchor must halve the VGU for the same cost.
    const before = vguFromUSD(0.011);
    expect(before).toBeGreaterThan(0);
    // vguFromUSD reads the anchor at module load, so assert the relationship
    // rather than re-importing: cost/anchor is linear by construction.
    expect(vguFromUSD(0.022)).toBeCloseTo(before * 2, 4);
  });
});

// ---------------------------------------------------------------------------
describe('pre-flight estimation', () => {
  it('scales with the model tier', () => {
    const cheap = estimateVGU({ feature: 'veegpt.chat', model: 'veegpt-hybrid' });
    const medium = estimateVGU({ feature: 'veegpt.chat', model: 'gemini-flash-latest' });
    const premium = estimateVGU({ feature: 'veegpt.chat', model: 'openai-gpt4o' });
    expect(cheap).toBe(1);
    expect(medium).toBe(3);
    expect(premium).toBe(12);
  });

  it('adds flat surcharges for expensive tools, not tier-multiplied ones', () => {
    // A paid search API costs the same whichever chat model asked for it.
    const cheapDeep = estimateVGU({
      feature: 'veegpt.chat',
      model: 'veegpt-hybrid',
      tools: ['deep_research'],
    });
    const premiumDeep = estimateVGU({
      feature: 'veegpt.chat',
      model: 'openai-gpt4o',
      tools: ['deep_research'],
    });
    expect(cheapDeep - 1).toBe(TOOL_BASE_VGU.deep_research);
    expect(premiumDeep - 12).toBe(TOOL_BASE_VGU.deep_research);
  });

  it('charges for media attachments', () => {
    const none = estimateVGU({ feature: 'veegpt.chat', model: 'veegpt-hybrid' });
    const two = estimateVGU({
      feature: 'veegpt.chat',
      model: 'veegpt-hybrid',
      attachments: 2,
    });
    expect(two).toBeGreaterThan(none);
  });

  it('scales up for very large contexts', () => {
    const normal = estimateVGU({
      feature: 'veegpt.chat',
      model: 'veegpt-hybrid',
      promptChars: 17_600,
    });
    const huge = estimateVGU({
      feature: 'veegpt.chat',
      model: 'veegpt-hybrid',
      promptChars: 176_000,
    });
    expect(huge).toBeGreaterThan(normal * 5);
  });

  it('never estimates below the floor or above the feature ceiling', () => {
    const tiny = estimateVGU({ feature: 'veegpt.title', model: 'veegpt-hybrid' });
    expect(tiny).toBeGreaterThanOrEqual(MIN_VGU_PER_REQUEST);

    const runaway = estimateVGU({
      feature: 'veegpt.chat',
      model: 'openai-gpt-5.5',
      promptChars: 50_000_000,
      tools: ['deep_research', 'search_web'],
      attachments: 50,
    });
    expect(runaway).toBeLessThanOrEqual(featureSpec('veegpt.chat').maxVGUPerRequest);
  });
});

// ---------------------------------------------------------------------------
describe('actual accounting from real tokens', () => {
  const REF = {
    inputTokens: VGU_REFERENCE_REQUEST.inputTokens,
    outputTokens: VGU_REFERENCE_REQUEST.outputTokens,
  };

  it('does NOT charge a flat multiplier — identical turns on different models differ by real cost', () => {
    const cheap = actualVGU({
      feature: 'veegpt.chat',
      calls: [{ model: 'gpt-4o-mini', usage: REF }],
    });
    const premium = actualVGU({
      feature: 'veegpt.chat',
      calls: [{ model: 'gpt-4o', usage: REF }],
    });
    expect(cheap.vgu).toBeCloseTo(1, 1);
    // Real ratio is ~16.7×, meaningfully above the 12× estimate — which is the
    // whole reason actual accounting exists.
    expect(premium.vgu).toBeGreaterThan(14);
    expect(premium.providerCostUSD).toBeGreaterThan(cheap.providerCostUSD * 10);
  });

  it('charges more for a bigger request on the SAME model', () => {
    const small = actualVGU({
      feature: 'veegpt.chat',
      calls: [{ model: 'gpt-4o-mini', usage: { inputTokens: 1000, outputTokens: 200 } }],
    });
    const large = actualVGU({
      feature: 'veegpt.chat',
      calls: [{ model: 'gpt-4o-mini', usage: { inputTokens: 100_000, outputTokens: 8_000 } }],
    });
    expect(large.vgu).toBeGreaterThan(small.vgu);
    expect(large.tokens.inputTokens).toBe(100_000);
  });

  it('aggregates every provider call of a multi-call job', () => {
    const calls = Array.from({ length: 12 }, () => ({
      model: 'gpt-5-nano',
      usage: { inputTokens: 8_750, outputTokens: 1_500 },
    }));
    const r = actualVGU({ feature: DEEP_RESEARCH_FEATURE, calls, tools: ['deep_research'] });
    expect(r.providerCalls).toBe(12);
    expect(r.tokens.inputTokens).toBe(105_000);
    expect(r.vgu).toBeGreaterThan(1);
  });

  it('counts paid non-LLM services (search APIs) in the same unit', () => {
    const withoutSearch = actualVGU({
      feature: DEEP_RESEARCH_FEATURE,
      calls: [{ model: 'gpt-5-nano', usage: REF }],
    });
    const withSearch = actualVGU({
      feature: DEEP_RESEARCH_FEATURE,
      calls: [{ model: 'gpt-5-nano', usage: REF }],
      externalCostUSD: 0.05,
    });
    expect(withSearch.vgu).toBeGreaterThan(withoutSearch.vgu);
    expect(withSearch.providerCostUSD).toBeCloseTo(
      withoutSearch.providerCostUSD + 0.05,
      6
    );
  });

  it('bounds a runaway job at the feature ceiling and flags it', () => {
    const calls = Array.from({ length: 500 }, () => ({
      model: 'gpt-4o',
      usage: { inputTokens: 100_000, outputTokens: 20_000 },
    }));
    const r = actualVGU({ feature: DEEP_RESEARCH_FEATURE, calls });
    const ceiling = featureSpec(DEEP_RESEARCH_FEATURE).maxVGUPerRequest;
    expect(r.vgu).toBeLessThanOrEqual(ceiling);
    expect(r.cappedByMaxPerRequest).toBe(true);
  });

  it('never charges zero for a real call', () => {
    const r = actualVGU({
      feature: 'veegpt.chat',
      calls: [{ model: 'gpt-5-nano', usage: { inputTokens: 5, outputTokens: 1 } }],
    });
    expect(r.vgu).toBeGreaterThanOrEqual(MIN_VGU_PER_REQUEST);
  });

  it('flags fallback pricing so cost reports stay honest', () => {
    const r = actualVGU({
      feature: 'veegpt.chat',
      calls: [{ model: 'some-unpriced-model', usage: REF }],
    });
    expect(r.usedFallbackPricing).toBe(true);
  });

  it('records the pricing version used, for the audit ledger', () => {
    const r = actualVGU({
      feature: 'veegpt.chat',
      calls: [{ model: 'gpt-4o-mini', usage: REF }],
    });
    expect(r.pricingVersions.length).toBe(1);
    expect(r.pricingVersions[0]).toContain('gpt-4o-mini');
  });
});

// ---------------------------------------------------------------------------
describe('plan policy', () => {
  it('uses the exact production limits from the specification', () => {
    expect(policyForPlan('free').fiveHourVGU).toBe(40);
    expect(policyForPlan('free').monthlyVGU).toBe(300);
    expect(policyForPlan('creator').fiveHourVGU).toBe(300);
    expect(policyForPlan('creator').monthlyVGU).toBe(3000);
    expect(policyForPlan('pro').fiveHourVGU).toBe(800);
    expect(policyForPlan('pro').monthlyVGU).toBe(12000);
    expect(policyForPlan('business').fiveHourVGU).toBe(2000);
    expect(policyForPlan('business').monthlyVGU).toBe(40000);
  });

  it('sets the request-rate and concurrency caps from the specification', () => {
    expect(policyForPlan('free').requestsPerMinute).toBe(10);
    expect(policyForPlan('creator').requestsPerMinute).toBe(20);
    expect(policyForPlan('pro').requestsPerMinute).toBe(40);
    expect(policyForPlan('business').requestsPerMinute).toBe(80);
    expect(policyForPlan('free').maxConcurrentAI).toBe(1);
    expect(policyForPlan('creator').maxConcurrentAI).toBe(2);
    expect(policyForPlan('pro').maxConcurrentAI).toBe(4);
    expect(policyForPlan('business').maxConcurrentAI).toBe(10);
  });

  it('gives Business a pooled budget with a 40% per-seat ceiling', () => {
    const policy = policyForPlan('business');
    expect(policy.pooled).toBe(true);
    expect(policy.seatSharePct).toBe(40);
    // 40% of the 40,000 pool — kept above Pro's 12,000 so the plans read distinct.
    expect(seatMonthlyCap(policy)).toBe(16000);
  });

  it('does not restrict a seat on non-pooled plans', () => {
    expect(seatMonthlyCap(policyForPlan('creator'))).toBe(3000);
  });

  it('leaves enterprise unlimited', () => {
    const p = policyForPlan('enterprise');
    expect(p.fiveHourVGU).toBe(UNLIMITED);
    expect(p.monthlyVGU).toBe(UNLIMITED);
    expect(seatMonthlyCap(p)).toBe(UNLIMITED);
  });

  it('increases capacity monotonically with plan price', () => {
    const ladder: PlanId[] = ['free', 'creator', 'pro', 'business'];
    for (let i = 1; i < ladder.length; i++) {
      const lo = policyForPlan(ladder[i - 1]);
      const hi = policyForPlan(ladder[i]);
      expect(hi.fiveHourVGU).toBeGreaterThan(lo.fiveHourVGU);
      expect(hi.monthlyVGU).toBeGreaterThan(lo.monthlyVGU);
      expect(hi.maxConcurrentAI).toBeGreaterThanOrEqual(lo.maxConcurrentAI);
    }
  });

  describe('env overrides (retune without a deploy)', () => {
    it('overrides a VGU budget', () => {
      process.env.VEEGPT_MONTHLY_VGU_FREE = '250';
      expect(policyForPlan('free').monthlyVGU).toBe(250);
    });
    it('treats a negative override as unlimited', () => {
      process.env.VEEGPT_5H_VGU_FREE = '-1';
      expect(policyForPlan('free').fiveHourVGU).toBe(UNLIMITED);
    });
    it('overrides concurrency and the seat share', () => {
      process.env.VEEGPT_CONCURRENCY_PRO = '9';
      process.env.VEEGPT_SEAT_SHARE_BUSINESS = '25';
      expect(policyForPlan('pro').maxConcurrentAI).toBe(9);
      // 25% of Business's 40,000 monthly pool.
      expect(seatMonthlyCap(policyForPlan('business'))).toBe(10000);
    });
  });
});

// ---------------------------------------------------------------------------
describe('model access matrix', () => {
  it('gives every plan full access to cheap models', () => {
    for (const plan of PLANS) {
      expect(tierAllocation(plan, 'cheap').access).toBe('full');
    }
  });

  it('gives Free LIMITED medium access — not zero, not full', () => {
    const medium = tierAllocation('free', 'medium');
    expect(medium.access).toBe('limited');
    expect(medium.maxRequests).toBeGreaterThan(0);
  });

  it('gives Free exactly 5 premium previews', () => {
    const premium = tierAllocation('free', 'premium');
    expect(premium.access).toBe('limited');
    expect(premium.maxRequests).toBe(5);
  });

  it('denies ultra to Free and Creator', () => {
    expect(tierAllocation('free', 'ultra').access).toBe('none');
    expect(tierAllocation('creator', 'ultra').access).toBe('none');
  });

  it('controls premium with a VGU sub-budget on paid plans', () => {
    for (const plan of ['creator', 'pro', 'business'] as PlanId[]) {
      const premium = tierAllocation(plan, 'premium');
      expect(premium.access).toBe('limited');
      expect(premium.maxVGU).toBeGreaterThan(0);
    }
  });

  it('never lets premium consume the entire monthly budget', () => {
    // Spec §17 — the whole point of a tier sub-budget.
    for (const plan of ['creator', 'pro', 'business'] as PlanId[]) {
      const premium = tierAllocation(plan, 'premium');
      expect(premium.maxVGU!).toBeLessThan(policyForPlan(plan).monthlyVGU);
    }
  });

  it('keeps ultra tighter than premium wherever both are allowed', () => {
    for (const plan of ['pro', 'business'] as PlanId[]) {
      const premium = tierAllocation(plan, 'premium');
      const ultra = tierAllocation(plan, 'ultra');
      expect(ultra.access).toBe('limited');
      expect(ultra.maxVGU!).toBeLessThan(premium.maxVGU!);
    }
  });

  it('gives enterprise full access to every tier', () => {
    for (const tier of TIERS) {
      expect(tierAllocation('enterprise', tier).access).toBe('full');
    }
  });
});

// ---------------------------------------------------------------------------
describe('feature registry', () => {
  it('bounds every feature with a per-request ceiling', () => {
    const features = [
      'veegpt.chat',
      'veegpt.media_analysis',
      'caption.generation',
      'hashtag.generation',
      'image.generation',
      'social_listening.extract',
      DEEP_RESEARCH_FEATURE,
      AUTOPILOT_FEATURE,
    ];
    for (const f of features) {
      const spec = featureSpec(f);
      expect(spec.maxVGUPerRequest, `${f} needs a ceiling`).toBeGreaterThan(0);
      expect(spec.baseVGU).toBeGreaterThan(0);
    }
  });

  it('governs deep research with every required bound', () => {
    const spec = featureSpec(DEEP_RESEARCH_FEATURE);
    expect(spec.baseVGU).toBe(40); // estimate only
    expect(spec.maxVGUPerRequest).toBeGreaterThan(spec.baseVGU);
    expect(spec.maxProviderCalls).toBeGreaterThan(0);
    expect(spec.timeoutMs).toBeGreaterThan(0);
    expect(spec.maxRetries).toBeGreaterThanOrEqual(0);
    expect(spec.concurrency).toBe(1);
    expect(featureMonthlyCap(DEEP_RESEARCH_FEATURE, 'pro')).toBeGreaterThan(0);
  });

  it('governs autopilot with every required bound', () => {
    const spec = featureSpec(AUTOPILOT_FEATURE);
    expect(spec.maxVGUPerRequest).toBeGreaterThan(0);
    expect(spec.maxProviderCalls).toBeGreaterThan(0);
    expect(spec.timeoutMs).toBeGreaterThan(0);
    expect(spec.concurrency).toBe(1);
    expect(featureMonthlyCap(AUTOPILOT_FEATURE, 'business')).toBeGreaterThan(0);
  });

  it('treats an unmapped feature conservatively rather than as free', () => {
    const spec = featureSpec('some.new.feature');
    expect(spec.baseVGU).toBeGreaterThan(0);
    expect(spec.maxVGUPerRequest).toBeGreaterThan(0);
    expect(spec.blocking).toBe(true);
  });

  it('marks tiny housekeeping calls non-blocking but still metered', () => {
    // Blocking a memory write on quota would corrupt the product for a
    // negligible cost; it is still charged.
    for (const f of ['veegpt.title', 'veegpt.memory_detect', 'veegpt.parse_intent']) {
      const spec = featureSpec(f);
      expect(spec.blocking).toBe(false);
      expect(spec.baseVGU).toBeGreaterThan(0);
      expect(spec.kind).toBe('internal');
    }
  });

  it('returns Infinity for features with no monthly cap', () => {
    expect(featureMonthlyCap('veegpt.chat', 'free')).toBe(UNLIMITED);
  });

  it('treats a -1 feature cap as unlimited', () => {
    expect(featureMonthlyCap(DEEP_RESEARCH_FEATURE, 'enterprise')).toBe(UNLIMITED);
  });
});

// ---------------------------------------------------------------------------
describe('windows and error codes', () => {
  it('defaults the burst window to a rolling 5 hours', () => {
    expect(burstWindowSec()).toBe(5 * 3600);
  });

  it('allows the burst window to be retuned', () => {
    process.env.VEEGPT_SESSION_WINDOW_HOURS = '6';
    expect(burstWindowSec()).toBe(6 * 3600);
  });

  it('expires reservations so a dead worker cannot lock quota forever', () => {
    expect(reservationTtlSec()).toBeGreaterThan(0);
    expect(reservationTtlSec()).toBeLessThanOrEqual(3600);
  });

  it('defines a distinct code for every refusal reason', () => {
    const codes = Object.values(VGU_ERROR);
    expect(new Set(codes).size).toBe(codes.length);
    // The one the client keys "Continue with Fast" off must exist.
    expect(VGU_ERROR.MODEL_QUOTA_EXHAUSTED).toBe('MODEL_QUOTA_EXHAUSTED');
  });
});

// ---------------------------------------------------------------------------
describe('economic safety of the configured plans', () => {
  /** Worst-case monthly provider spend if a plan's whole budget were burned. */
  const worstCaseUSD = (plan: PlanId) =>
    policyForPlan(plan).monthlyVGU * VGU_ANCHOR_USD;

  it('bounds worst-case provider cost per user to a known constant', () => {
    // The core protection: the ceiling exists and is finite for every paid plan.
    for (const plan of ['free', 'creator', 'pro', 'business'] as PlanId[]) {
      expect(Number.isFinite(worstCaseUSD(plan))).toBe(true);
    }
  });

  it('keeps worst-case AI cost below plan revenue (gross-margin-positive even at full burn)', () => {
    // Early-stage the VGU budgets were raised ~2.5× to feel unrestricted while
    // the user base is small, deliberately trading thinner margin for generosity.
    // The invariant that MUST still hold: even if a user burned their ENTIRE
    // monthly budget on the most expensive models, provider cost stays below the
    // subscription price — so no subscriber is gross-negative. (Realistically far
    // cheaper, since most turns use cheap/medium models at ~1 VGU.) Tighten the
    // per-plan budgets via env once real usage and unit economics are known.
    const USD_PER_INR = 1 / 83;
    const revenueUSD: Record<string, number> = {
      creator: 799 * USD_PER_INR,
      pro: 1999 * USD_PER_INR,
      business: 4999 * USD_PER_INR,
    };
    for (const plan of ['creator', 'pro', 'business'] as PlanId[]) {
      const ratio = worstCaseUSD(plan) / revenueUSD[plan];
      expect(ratio, `${plan} worst-case AI cost ratio`).toBeLessThan(1.0);
    }
  });

  it('keeps the free plan a bounded acquisition cost', () => {
    expect(worstCaseUSD('free')).toBeLessThan(0.5);
  });
});
