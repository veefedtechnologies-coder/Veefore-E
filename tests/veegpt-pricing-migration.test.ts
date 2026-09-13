/**
 * Pricing consolidation — behaviour preservation.
 *
 * Three duplicated, drifted price tables were retired in favour of one versioned
 * registry:
 *   • AICreditMeteringService  MODEL_PRICES      (INR, regex-matched)
 *   • veegpt-chat.routes       AI_PRICING        (USD, 7 models)
 *   • subscription.controller  BILLING_AI_PRICING_USD (USD, 7 models)
 *
 * The credit table drove REAL user charges, so these tests prove the registry
 * reproduces it exactly for every model that actually occurs, and that the two
 * reporting tables no longer under-report unlisted models as costing zero.
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  providerCostUSD,
  providerCostINR,
  usdToInr,
  priceFor,
  isPriced,
} from '../server/config/veegpt-pricing.registry';
import { estimateProviderCostInr } from '../server/features/subscription/services/AICreditMeteringService';
import type { AIUsageSample } from '../server/services/aiUsageTracker';
import { listRegisteredModels } from '../server/services/ai-model-routing';
import { MODEL_TIER } from '../shared/veegpt-model-tiers';

const savedEnv = { ...process.env };
afterEach(() => {
  process.env = { ...savedEnv };
});

/** The retired INR table, reproduced here purely as the regression baseline. */
const LEGACY_INR: Array<{ match: RegExp; input: number; output: number }> = [
  { match: /gemini.*flash.*lite/i, input: 8.4, output: 33.6 },
  { match: /gpt-4o-mini|gpt-4\.1-mini/i, input: 12.6, output: 50.4 },
  { match: /gpt-4o|gpt-4\.1/i, input: 210, output: 840 },
];

function legacyInrCost(
  model: string,
  prompt: number,
  completion: number,
  cached = 0
): number | null {
  const row = LEGACY_INR.find(r => r.match.test(model));
  if (!row) return null;
  const c = Math.min(cached, prompt);
  const fresh = Math.max(0, prompt - c);
  return (
    ((fresh + c * 0.1) / 1_000_000) * row.input +
    (completion / 1_000_000) * row.output
  );
}

const sample = (
  model: string,
  promptTokens: number,
  completionTokens: number,
  cachedTokens = 0
): AIUsageSample => ({
  provider: 'openai',
  model,
  promptTokens,
  completionTokens,
  totalTokens: promptTokens + completionTokens,
  cachedTokens,
  estimated: false,
  callType: 'text',
});

describe('credit charges are unchanged by the consolidation', () => {
  // No cached tokens: fresh-input and output rates are UNCHANGED by the pricing
  // work, so these must still reproduce the retired rupee table to the cent.
  // (Cache-hit cases moved to their own test below, because cached tokens are now
  // billed at the real provider discount rather than the retired table's flat
  // 10% — a deliberate accuracy correction.)
  const CASES: Array<[string, number, number, number]> = [
    ['gpt-4o-mini', 4400, 700, 0],
    ['gpt-4o', 4400, 700, 0],
    ['gemini-flash-lite-latest', 4400, 700, 0],
    ['gemini-flash-lite-latest', 200_000, 12_000, 0],
  ];

  it.each(CASES)(
    'matches the retired INR table EXACTLY for %s (%i in / %i out / %i cached)',
    (model, prompt, completion, cached) => {
      const legacy = legacyInrCost(model, prompt, completion, cached);
      expect(legacy, `no legacy baseline for ${model}`).not.toBeNull();
      const now = providerCostINR(model, {
        inputTokens: prompt,
        outputTokens: completion,
        cachedTokens: cached,
      });
      // Exact, not approximate: the registry's USD prices at the legacy FX rate
      // of 84 INR/USD reproduce the retired rupee table to the cent. A mismatch
      // here means real user credit charges moved.
      expect(now).toBeCloseTo(legacy!, 8);
    }
  );

  it('bills cached prompt tokens at the REAL provider discount (deliberate correction)', () => {
    // The retired table charged every cached token at a flat 10% of the fresh
    // input rate. OpenAI actually bills cached prompt tokens at 50% for gpt-4o
    // (and 25% for the gpt-4.1 family), so the registry now uses the published
    // cached rate. This is the ONE credit-charge change here, and it only affects
    // requests that hit the prompt cache. Fresh input and output are unchanged
    // (asserted above), so a normal no-cache request costs exactly what it did.
    const usdToInrRate = usdToInr(); // 84
    // gpt-4o: 50k fresh-eligible input, 5k output, 10k cached.
    // fresh = 40k @ $2.50, cached = 10k @ $1.25 (real 50%), output = 5k @ $10.
    const expectedGpt4oUsd =
      (40_000 / 1e6) * 2.5 + (10_000 / 1e6) * 1.25 + (5_000 / 1e6) * 10.0;
    const gpt4o = providerCostINR('gpt-4o', {
      inputTokens: 50_000,
      outputTokens: 5_000,
      cachedTokens: 10_000,
    });
    expect(gpt4o).toBeCloseTo(expectedGpt4oUsd * usdToInrRate, 8);

    // gpt-4o-mini: fresh = 60k @ $0.15, cached = 40k @ $0.075, output = 8k @ $0.60.
    const expectedMiniUsd =
      (60_000 / 1e6) * 0.15 + (40_000 / 1e6) * 0.075 + (8_000 / 1e6) * 0.6;
    const mini = providerCostINR('gpt-4o-mini', {
      inputTokens: 100_000,
      outputTokens: 8_000,
      cachedTokens: 40_000,
    });
    expect(mini).toBeCloseTo(expectedMiniUsd * usdToInrRate, 8);

    // A cache hit is still CHEAPER than paying fresh for the same tokens — the
    // whole point of caching — just not as cheap as the old 10% flat.
    const allFresh = providerCostINR('gpt-4o', {
      inputTokens: 50_000,
      outputTokens: 5_000,
    });
    expect(gpt4o).toBeLessThan(allFresh);
  });

  it('CORRECTS the legacy underpricing of gpt-4.1-mini (deliberate change)', () => {
    // The retired table matched /gpt-4o-mini|gpt-4\.1-mini/ and priced BOTH at
    // $0.15/$0.60. gpt-4.1-mini actually costs $0.40/$1.60, so it was underpriced
    // ~2.6× and its credit charges were subsidised. This is the one intentional
    // charge change in the consolidation.
    const legacy = legacyInrCost('gpt-4.1-mini', 8_000, 1_200)!;
    const now = providerCostINR('gpt-4.1-mini', {
      inputTokens: 8_000,
      outputTokens: 1_200,
    });
    expect(now).toBeGreaterThan(legacy * 2);
    // And it must be priced independently of gpt-4o-mini from now on.
    expect(priceFor('gpt-4.1-mini').input).toBeCloseTo(0.4, 6);
    expect(priceFor('gpt-4o-mini').input).toBeCloseTo(0.15, 6);
  });

  it('keeps the metering service in agreement with the registry', () => {
    const usage = [sample('gpt-4o-mini', 4400, 700), sample('gpt-4o', 1000, 200)];
    const viaService = estimateProviderCostInr(usage);
    const viaRegistry =
      providerCostINR('gpt-4o-mini', { inputTokens: 4400, outputTokens: 700 }) +
      providerCostINR('gpt-4o', { inputTokens: 1000, outputTokens: 200 });
    expect(viaService).toBeCloseTo(viaRegistry, 8);
  });

  it('defaults to the legacy FX rate so charges do not silently shift', () => {
    expect(usdToInr()).toBe(84);
    // ₹12.6 per 1M input for gpt-4o-mini is exactly the retired table's value.
    expect(
      providerCostINR('gpt-4o-mini', { inputTokens: 1_000_000 })
    ).toBeCloseTo(12.6, 8);
  });

  it('honours a configurable FX rate instead of a hidden constant', () => {
    const base = providerCostINR('gpt-4o-mini', { inputTokens: 1_000_000 });
    process.env.AI_USD_TO_INR = '168';
    const doubled = providerCostINR('gpt-4o-mini', { inputTokens: 1_000_000 });
    expect(usdToInr()).toBe(168);
    expect(doubled).toBeCloseTo(base * 2, 6);
  });

  it('still charges a conservative amount for an unpriced model', () => {
    // The old table fell back to 210/840 INR. The registry's fallback must be at
    // least that expensive so unknown models are never the cheap option.
    const unknown = providerCostINR('mystery-model-9000', {
      inputTokens: 1_000_000,
    });
    expect(unknown).toBeGreaterThanOrEqual(210);
  });
});

describe('reporting no longer under-reports cost as zero', () => {
  it('prices models the retired 7-model tables did not list', () => {
    // These were all reported as costing $0 by the old dashboard/billing tables.
    for (const model of [
      'gpt-5',
      'gpt-5-mini',
      'gpt-5-nano',
      'gpt-4.1',
      'gpt-4.1-nano',
      'gemini-pro-latest',
      'gemini-flash-latest',
      'claude-3-5-sonnet',
    ]) {
      const cost = providerCostUSD(model, {
        inputTokens: 10_000,
        outputTokens: 1_000,
      });
      expect(cost.usd, `${model} must not be free`).toBeGreaterThan(0);
      expect(cost.estimated, `${model} should be really priced`).toBe(false);
    }
  });

  it('reproduces the old USD numbers for the models that WERE listed', () => {
    const legacyUSD: Record<string, { input: number; output: number }> = {
      'gpt-4o-mini': { input: 0.15, output: 0.6 },
      'gpt-4o': { input: 2.5, output: 10.0 },
      'gpt-4.1-mini': { input: 0.4, output: 1.6 },
    };
    for (const [model, p] of Object.entries(legacyUSD)) {
      const row = priceFor(model);
      expect(row.input, `${model} input`).toBeCloseTo(p.input, 6);
      expect(row.output, `${model} output`).toBeCloseTo(p.output, 6);
    }
  });

  it('captures reasoning tokens without double-charging them', () => {
    // The real correction is upstream: the normalizers now READ
    // completion_tokens_details.reasoning_tokens, which the old tables discarded
    // entirely, so reasoning is finally visible in the ledger. Cost itself comes
    // from completion_tokens (which already contains it), so recording the
    // breakdown must not change the charge.
    const a = providerCostUSD('gpt-5', { inputTokens: 5_000, outputTokens: 4_500 });
    const b = providerCostUSD('gpt-5', {
      inputTokens: 5_000,
      outputTokens: 4_500,
      reasoningTokens: 4_000,
    });
    expect(b.usd).toBeCloseTo(a.usd, 10);
    // And a heavy-reasoning request IS more expensive, because its completion
    // count is larger — which is exactly what the provider bills.
    const heavy = providerCostUSD('gpt-5', {
      inputTokens: 5_000,
      outputTokens: 40_000,
      reasoningTokens: 36_000,
    });
    expect(heavy.usd).toBeGreaterThan(a.usd * 5);
  });
});

// ---------------------------------------------------------------------------
// Dated model snapshots (regression: a ~30x over-charge found by measurement)
// ---------------------------------------------------------------------------

describe('dated provider snapshot ids resolve to their base price row', () => {
  /**
   * Providers echo a dated snapshot id rather than the alias requested
   * (`gpt-4o-mini` → `gpt-4o-mini-2024-07-18`). The guard records what the
   * provider reported, so if snapshots did not resolve, every guarded call would
   * silently be priced at the conservative unknown rate ($5/$20 per 1M).
   */
  it('prices a dated snapshot exactly like its alias', () => {
    for (const [snapshot, alias] of [
      ['gpt-4o-mini-2024-07-18', 'gpt-4o-mini'],
      ['gpt-4o-2024-11-20', 'gpt-4o'],
    ] as const) {
      const snap = priceFor(snapshot);
      const base = priceFor(alias);
      expect(snap.pricingVersion, snapshot).toBe(base.pricingVersion);
      expect(snap.input, snapshot).toBe(base.input);
      expect(snap.output, snapshot).toBe(base.output);
      expect(isPriced(snapshot), snapshot).toBe(true);
    }
  });

  it('never collapses a mini snapshot onto the full model', () => {
    // Longest-prefix matching matters in BOTH directions: mapping
    // gpt-4o-mini-2024-07-18 onto gpt-4o would be a ~16x OVER-charge.
    expect(priceFor('gpt-4o-mini-2024-07-18').model).toBe('gpt-4o-mini');
    expect(priceFor('gpt-4o-mini-2024-07-18').input).toBeLessThan(
      priceFor('gpt-4o').input
    );
  });

  it('still refuses to guess for a genuinely unknown model', () => {
    // The safety property must survive prefix matching: an unrelated id stays
    // expensive rather than matching something cheap by accident.
    expect(isPriced('llama-4-titan')).toBe(false);
    expect(isPriced('gpt')).toBe(false);
  });

  it('requires a clean segment boundary', () => {
    // "gpt-4o-minix" is not a snapshot of "gpt-4o-mini".
    expect(isPriced('gpt-4o-minix')).toBe(false);
  });

  it('handles a provider-prefixed dated snapshot', () => {
    expect(priceFor('openai/gpt-4o-mini-2024-07-18').model).toBe('gpt-4o-mini');
  });
});

// ---------------------------------------------------------------------------
// App-level model ids must be priced (regression: the whole chat path was
// billed at the conservative unknown rate)
// ---------------------------------------------------------------------------

describe('every selectable model resolves to a real price row', () => {
  /**
   * WHY THIS TEST EXISTS
   * The pricing registry is keyed by PROVIDER ids (`gpt-5-nano`), but the app
   * stores and logs APP ids (`openai-gpt-5-nano`) and AIServiceManager records
   * the app id it routed. Nothing connected the two, so every VeeGPT chat turn
   * was priced with UNKNOWN_MODEL_PRICE — $5/$20 per 1M instead of $0.05/$0.40,
   * a ~30x over-charge that no existing test could see because the tests used
   * provider ids directly.
   *
   * This asserts the invariant across the ACTUAL registry of selectable models,
   * so adding a model without a price row now fails CI instead of quietly
   * over-charging users.
   */
  it('prices every model in the routing registry', () => {
    const unpriced = listRegisteredModels().filter(m => !isPriced(m));
    expect(unpriced, `unpriced app models: ${unpriced.join(', ')}`).toEqual([]);
  });

  it('prices every model in the tier map', () => {
    const unpriced = Object.keys(MODEL_TIER).filter(m => !isPriced(m));
    expect(unpriced, `unpriced tier models: ${unpriced.join(', ')}`).toEqual([]);
  });

  it('resolves an app id to the SAME row as its provider id', () => {
    for (const [appId, providerId] of [
      ['openai-gpt4o', 'gpt-4o'],
      ['openai-gpt-5-nano', 'gpt-5-nano'],
      ['openai-gpt-4o-mini', 'gpt-4o-mini'],
      // A retired alias must price as its live replacement, not as unknown.
      ['github-gpt-4o-mini', 'gpt-4o-mini'],
      // veegpt-hybrid is an app-only name for a Gemini model.
      ['veegpt-hybrid', 'gemini-flash-lite-latest'],
    ] as const) {
      expect(priceFor(appId).pricingVersion, appId).toBe(
        priceFor(providerId).pricingVersion
      );
    }
  });

  it('keeps tier ordering consistent with real prices', () => {
    // If an app id silently fell back to the unknown rate, a cheap model would
    // price ABOVE a premium one — the exact symptom of the bug this guards.
    expect(priceFor('openai-gpt-5-nano').output).toBeLessThan(
      priceFor('openai-gpt4o').output
    );
    expect(priceFor('veegpt-hybrid').output).toBeLessThan(
      priceFor('gemini-2.5-pro').output
    );
  });
});
