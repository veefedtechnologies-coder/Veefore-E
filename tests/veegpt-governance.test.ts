/**
 * Deep Research and Autopilot governance policy (Block 8, spec §22–§23).
 *
 * Pure config/estimate logic, so these run on every commit. They exist because
 * both features had every ceiling DECLARED and applied to nothing: deep research
 * ran inside the chat turn's reservation, so the chat turn's cap governed a job
 * with its own limit, its monthly allowance was never checked, and "one concurrent
 * research job" was not enforced at all.
 *
 * These tests pin the numbers and the invariants; the runtime enforcement is
 * proven by server/scripts/verify-vgu-governance.ts.
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  AUTOPILOT_FEATURE,
  DEEP_RESEARCH_FEATURE,
  featureConcurrencyLimit,
  featureMonthlyCap,
  featureMonthlyRequestCap,
  featureProviderCallLimit,
  featureSpec,
  featureTimeoutMs,
  policyForPlan,
  UNLIMITED,
} from '../server/config/veegpt-vgu.config';
import { estimateVGU, estimateVGURange, TOOL_BASE_VGU } from '../server/services/veegpt-vgu';
import { AUTOPILOT_CAPACITY_MESSAGE } from '../server/features/autopilot/workers/autopilotLoopWorker';

const ENV = [
  'VEEGPT_FEATURE_CONCURRENCY_VEEGPT_DEEP_RESEARCH',
  'VEEGPT_FEATURE_CALLS_VEEGPT_DEEP_RESEARCH',
  'VEEGPT_FEATURE_TIMEOUT_VEEGPT_DEEP_RESEARCH',
  'VEEGPT_FEATURE_CAP_VEEGPT_DEEP_RESEARCH_PRO',
];
afterEach(() => {
  for (const k of ENV) delete process.env[k];
});

const GOVERNED = [DEEP_RESEARCH_FEATURE, AUTOPILOT_FEATURE] as const;

describe('every ceiling the spec lists actually exists', () => {
  it.each(GOVERNED)('%s declares all six controls', feature => {
    const spec = featureSpec(feature);
    // §22 for research, §23 for autopilot — the same six controls.
    expect(spec.maxVGUPerRequest, 'max VGU per job').toBeGreaterThan(0);
    expect(spec.monthlyCapByPlan, 'monthly allowance').toBeDefined();
    expect(featureConcurrencyLimit(feature), 'concurrency').toBeGreaterThan(0);
    expect(featureProviderCallLimit(feature), 'max provider calls').toBeGreaterThan(0);
    expect(featureTimeoutMs(feature), 'timeout').toBeGreaterThan(0);
    expect(spec.maxRetries, 'retry limit').toBeGreaterThanOrEqual(0);
  });

  it('blocks rather than silently continuing when refused', () => {
    for (const feature of GOVERNED) {
      expect(featureSpec(feature).blocking).toBe(true);
    }
  });
});

describe('deep research is governed by its OWN limits, not the caller\u2019s', () => {
  it('bounds a single research job to a low, fixed ceiling', () => {
    // Deep research is the most expensive thing the product does, so ONE job is
    // deliberately capped low (≈$0.88 of provider spend) — this both controls
    // cost and makes the Free/Creator preview safe. It runs in its OWN governed
    // scope, so this ceiling — not the chat turn's — is what bounds it.
    expect(featureSpec(DEEP_RESEARCH_FEATURE).maxVGUPerRequest).toBe(800);
  });

  it('has a tighter concurrency limit than the plan', () => {
    // One research job at a time even on Business, whose plan limit is 10.
    expect(featureConcurrencyLimit(DEEP_RESEARCH_FEATURE)).toBe(1);
    for (const plan of ['creator', 'pro', 'business'] as const) {
      expect(featureConcurrencyLimit(DEEP_RESEARCH_FEATURE)).toBeLessThan(
        policyForPlan(plan).maxConcurrentAI
      );
    }
  });

  it('has a tighter call ceiling and a longer timeout than a chat turn', () => {
    // Fewer calls (it must not fan out indefinitely) but more time (it legitimately
    // takes minutes).
    expect(featureProviderCallLimit(DEEP_RESEARCH_FEATURE)).toBeLessThan(
      featureProviderCallLimit('veegpt.chat')
    );
    expect(featureTimeoutMs(DEEP_RESEARCH_FEATURE)).toBeGreaterThan(
      featureTimeoutMs('veegpt.chat')
    );
  });

  it('scales its allowance with the plan and uncaps Enterprise', () => {
    expect(featureMonthlyCap(DEEP_RESEARCH_FEATURE, 'pro')).toBeLessThan(
      featureMonthlyCap(DEEP_RESEARCH_FEATURE, 'business')
    );
    expect(featureMonthlyCap(DEEP_RESEARCH_FEATURE, 'enterprise')).toBe(UNLIMITED);
  });

  it('gives Free and Creator a COUNT-bounded research preview', () => {
    // The preview is guaranteed by a request-COUNT cap, not a VGU cap: Free may
    // run deep research exactly once and Creator twice per period, however cheap
    // each run is. A VGU cap alone would let many low-cost runs slip through.
    expect(featureMonthlyRequestCap(DEEP_RESEARCH_FEATURE, 'free')).toBe(1);
    expect(featureMonthlyRequestCap(DEEP_RESEARCH_FEATURE, 'creator')).toBe(2);
    // Paid plans are uncapped on COUNT — bounded by their VGU allowance instead.
    expect(featureMonthlyRequestCap(DEEP_RESEARCH_FEATURE, 'pro')).toBe(UNLIMITED);
    expect(featureMonthlyRequestCap(DEEP_RESEARCH_FEATURE, 'business')).toBe(UNLIMITED);
    // The VGU sub-cap still exists and each plan can fit at least one full job.
    const ceiling = featureSpec(DEEP_RESEARCH_FEATURE).maxVGUPerRequest;
    expect(featureMonthlyCap(DEEP_RESEARCH_FEATURE, 'free')).toBeGreaterThanOrEqual(ceiling);
    expect(featureMonthlyCap(DEEP_RESEARCH_FEATURE, 'creator')).toBeGreaterThanOrEqual(2 * ceiling);
  });

  it('lets an operator retune every ceiling without a deploy', () => {
    process.env.VEEGPT_FEATURE_CONCURRENCY_VEEGPT_DEEP_RESEARCH = '2';
    process.env.VEEGPT_FEATURE_CALLS_VEEGPT_DEEP_RESEARCH = '10';
    process.env.VEEGPT_FEATURE_TIMEOUT_VEEGPT_DEEP_RESEARCH = '1000';
    process.env.VEEGPT_FEATURE_CAP_VEEGPT_DEEP_RESEARCH_PRO = '77';
    expect(featureConcurrencyLimit(DEEP_RESEARCH_FEATURE)).toBe(2);
    expect(featureProviderCallLimit(DEEP_RESEARCH_FEATURE)).toBe(10);
    expect(featureTimeoutMs(DEEP_RESEARCH_FEATURE)).toBe(1000);
    expect(featureMonthlyCap(DEEP_RESEARCH_FEATURE, 'pro')).toBe(77);
  });

  it('treats a negative override as unbounded, not as zero', () => {
    process.env.VEEGPT_FEATURE_CONCURRENCY_VEEGPT_DEEP_RESEARCH = '-1';
    process.env.VEEGPT_FEATURE_CALLS_VEEGPT_DEEP_RESEARCH = '-1';
    expect(featureConcurrencyLimit(DEEP_RESEARCH_FEATURE)).toBe(0);
    expect(featureProviderCallLimit(DEEP_RESEARCH_FEATURE)).toBe(0);
  });
});

describe('autopilot cannot loop forever (\u00a723)', () => {
  it('reports the spec\u2019s exact sentence when it hits its ceiling', () => {
    expect(AUTOPILOT_CAPACITY_MESSAGE).toBe(
      'Autopilot reached its AI capacity for this task.'
    );
  });

  it('runs one iteration at a time', () => {
    expect(featureConcurrencyLimit(AUTOPILOT_FEATURE)).toBe(1);
  });

  it('bounds a single iteration in VGU, calls and time', () => {
    const spec = featureSpec(AUTOPILOT_FEATURE);
    expect(spec.maxVGUPerRequest).toBe(2500);
    expect(featureProviderCallLimit(AUTOPILOT_FEATURE)).toBe(40);
    expect(featureTimeoutMs(AUTOPILOT_FEATURE)).toBe(15 * 60 * 1000);
  });

  it('has a plan-specific monthly budget', () => {
    expect(featureMonthlyCap(AUTOPILOT_FEATURE, 'pro')).toBeGreaterThan(0);
    expect(featureMonthlyCap(AUTOPILOT_FEATURE, 'pro')).toBeLessThan(
      featureMonthlyCap(AUTOPILOT_FEATURE, 'business')
    );
    expect(featureMonthlyCap(AUTOPILOT_FEATURE, 'enterprise')).toBe(UNLIMITED);
  });

  it('costs more per iteration than a chat turn, since it does more', () => {
    expect(featureSpec(AUTOPILOT_FEATURE).baseVGU).toBeGreaterThan(
      featureSpec('veegpt.chat').baseVGU
    );
  });
});

describe('the pre-flight estimate is an honest range (\u00a722)', () => {
  it('starts at the 40 VGU base the spec names', () => {
    // "Initial estimated base: 40 VGU" — an estimate only; the charge is
    // reconciled from real usage.
    expect(TOOL_BASE_VGU.deep_research).toBe(40);
    expect(estimateVGU({ feature: DEEP_RESEARCH_FEATURE })).toBe(40);
  });

  it('quotes a range, not a single number', () => {
    const r = estimateVGURange({ feature: DEEP_RESEARCH_FEATURE });
    expect(r.high).toBeGreaterThan(r.low);
    // The spec's example shape: ~40–100 VGU.
    expect(r.low).toBe(40);
    expect(r.high).toBe(100);
  });

  it('never quotes above the hard per-job ceiling', () => {
    // Otherwise the estimate would promise a spend the engine refuses to bill.
    const r = estimateVGURange({
      feature: DEEP_RESEARCH_FEATURE,
      model: 'openai-gpt4o',
      promptChars: 5_000_000,
    });
    expect(r.high).toBeLessThanOrEqual(r.ceiling);
    expect(r.ceiling).toBe(featureSpec(DEEP_RESEARCH_FEATURE).maxVGUPerRequest);
  });

  it('estimates higher for a more expensive model', () => {
    const cheap = estimateVGURange({
      feature: DEEP_RESEARCH_FEATURE,
      model: 'openai-gpt-4o-mini',
    });
    const premium = estimateVGURange({
      feature: DEEP_RESEARCH_FEATURE,
      model: 'openai-gpt4o',
    });
    expect(premium.low).toBeGreaterThan(cheap.low);
  });

  it('reports whole numbers, because this is user-facing copy', () => {
    const r = estimateVGURange({
      feature: DEEP_RESEARCH_FEATURE,
      promptChars: 31_337,
    });
    expect(Number.isInteger(r.low)).toBe(true);
    expect(Number.isInteger(r.high)).toBe(true);
  });
});
