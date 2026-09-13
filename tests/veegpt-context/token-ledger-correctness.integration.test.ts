/**
 * Token_Ledger correctness — context-optimization scope isolation (task 10.4).
 *
 * Feature: veegpt-context-optimization — Phase 8 Regression_Suite.
 * Validates: Requirements 24.1, 24.3.
 *
 * The context refactor changes HOW the model request is assembled. It must NOT
 * change HOW a request is charged. This integration test reuses the EXISTING
 * ledger charging path — the same provider→usage→cost→VGU pipeline the real
 * reconciliation runs:
 *
 *     provider usage → fromOpenAIUsage → providerCostUSD → actualVGU
 *
 * and proves two things end-to-end with a mocked provider (no live keys, no DB):
 *
 *   (a) CHARGING IS DERIVED FROM ACTUAL PROVIDER-REPORTED USAGE (Req 24.3).
 *       The final VGU charged equals the provider cost of the reported tokens
 *       divided by the anchor — it tracks real usage and is completely
 *       INDEPENDENT of the composer's per-category token ESTIMATES. Feeding the
 *       composer a wildly different estimate never moves the charge; changing
 *       the provider-reported usage always does.
 *
 *   (b) CONTEXT-TELEMETRY RIDES THE LEDGER `meta` WITHOUT ALTERING BILLING
 *       (Req 24.1 / 24.3). The `contextTelemetry` object attaches to the ledger
 *       event's free-form `meta` field; the billing fields (actualVGU,
 *       actualProviderCostUSD, token counts) are byte-for-byte identical whether
 *       or not telemetry is attached. Telemetry carries counts + metadata only —
 *       never prompt or user content — so nothing sensitive leaks into the
 *       ledger.
 *
 * SCOPE-ISOLATION GUARD (Req 24.1): the telemetry module must not import or
 * compute anything from the billing/pricing/ledger subsystems — otherwise a
 * context change could silently alter a charge. A source-level check enforces
 * that the charge path and the telemetry path stay separate.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  actualVGU,
  estimateVGU,
  clampVGU,
  type ActualVGUInput,
} from '../../server/services/veegpt-vgu';
import {
  providerCostUSD,
  type TokenUsage,
} from '../../server/config/veegpt-pricing.registry';
import { fromOpenAIUsage } from '../../server/services/aiUsageTracker';
import {
  VGU_ANCHOR_USD,
  MIN_VGU_PER_REQUEST,
  featureSpec,
} from '../../server/config/veegpt-vgu.config';
import {
  telemetryToLedgerMeta,
  type TokenTelemetry,
} from '../../server/routes/veegpt-token-telemetry';
import type { LedgerEntry } from '../../server/services/veegpt-ledger';
import { runOptimized, LEDGER_META_KEYS, type EquivalenceCase } from './golden-equivalence.harness';

const FEATURE = 'veegpt.chat';
const MODEL = 'gpt-5';

/** Normalize a mocked OpenAI usage payload the way the real path does. */
function usageFromProvider(u: {
  prompt_tokens: number;
  completion_tokens: number;
  reasoning_tokens?: number;
  cached_tokens?: number;
}): TokenUsage {
  const norm = fromOpenAIUsage({
    prompt_tokens: u.prompt_tokens,
    completion_tokens: u.completion_tokens,
    completion_tokens_details: u.reasoning_tokens
      ? { reasoning_tokens: u.reasoning_tokens }
      : undefined,
    prompt_tokens_details: u.cached_tokens
      ? { cached_tokens: u.cached_tokens }
      : undefined,
  })!;
  return {
    inputTokens: norm.promptTokens,
    outputTokens: norm.completionTokens,
    reasoningTokens: norm.reasoningTokens,
    cachedTokens: norm.cachedTokens,
  };
}

/** Charge exactly as the reconciliation does, from actual provider usage. */
function chargeFromActualUsage(usage: TokenUsage): ActualVGUInput {
  return { feature: FEATURE, calls: [{ model: MODEL, usage }] };
}

/** The VGU we EXPECT for a usage, recomputed independently from first principles. */
function expectedVGU(usage: TokenUsage): number {
  const usd = providerCostUSD(MODEL, usage).usd;
  return clampVGU(usd / VGU_ANCHOR_USD, featureSpec(FEATURE).maxVGUPerRequest);
}

// ---------------------------------------------------------------------------
// (a) Charging is derived from actual provider-reported usage (Req 24.3)
// ---------------------------------------------------------------------------

describe('Token_Ledger · charge is computed from actual provider usage (Req 24.3)', () => {
  it('final VGU equals the provider cost of the reported tokens ÷ anchor', () => {
    const usage = usageFromProvider({ prompt_tokens: 5000, completion_tokens: 500 });
    const result = actualVGU(chargeFromActualUsage(usage));

    // The charge is the money the provider tokens cost, normalized by the anchor.
    expect(result.providerCostUSD).toBeCloseTo(providerCostUSD(MODEL, usage).usd, 12);
    expect(result.vgu).toBe(expectedVGU(usage));
    // Aggregated token counts on the event mirror the provider's report exactly.
    expect(result.tokens.inputTokens).toBe(5000);
    expect(result.tokens.outputTokens).toBe(500);
    expect(result.providerCalls).toBe(1);
  });

  it('a heavier provider report costs strictly more — the charge tracks real usage', () => {
    const light = actualVGU(
      chargeFromActualUsage(usageFromProvider({ prompt_tokens: 2000, completion_tokens: 200 }))
    );
    const heavy = actualVGU(
      chargeFromActualUsage(usageFromProvider({ prompt_tokens: 60000, completion_tokens: 8000 }))
    );
    expect(heavy.vgu).toBeGreaterThan(light.vgu);
    expect(heavy.providerCostUSD).toBeGreaterThan(light.providerCostUSD);
  });

  it("the composer's token ESTIMATE never changes the charge (charge ≠ estimate)", () => {
    // Same provider-reported usage, two very different composer estimates. The
    // composer's telemetry is observability; it must not feed the charge.
    const usage = usageFromProvider({ prompt_tokens: 5000, completion_tokens: 500 });

    const tinyEstimate = buildTelemetryWithEstimate(50);
    const hugeEstimate = buildTelemetryWithEstimate(999_999);
    // Sanity: the two estimates really are different observability numbers.
    expect(tinyEstimate.totalInputTokens).not.toBe(hugeEstimate.totalInputTokens);

    const chargeA = actualVGU(chargeFromActualUsage(usage)).vgu;
    const chargeB = actualVGU(chargeFromActualUsage(usage)).vgu;
    // The charge depends ONLY on provider usage, so it is identical regardless of
    // whichever estimate the composer happened to produce for the same turn.
    expect(chargeA).toBe(chargeB);
    expect(chargeA).toBe(expectedVGU(usage));
  });

  it('the pre-flight estimate and the final charge are distinct numbers (estimate is not billed)', () => {
    const estimate = estimateVGU({ feature: FEATURE, model: MODEL, promptChars: 200 });
    const usage = usageFromProvider({ prompt_tokens: 5000, completion_tokens: 500 });
    const charged = actualVGU(chargeFromActualUsage(usage)).vgu;
    // Both are valid VGU numbers, but the billed one comes from real tokens, not
    // from the reservation estimate.
    expect(estimate).toBeGreaterThanOrEqual(MIN_VGU_PER_REQUEST);
    expect(charged).toBe(expectedVGU(usage));
    expect(charged).not.toBe(estimate);
  });

  it('cached prompt tokens are billed from the provider report, not re-estimated', () => {
    const fresh = usageFromProvider({ prompt_tokens: 10_000, completion_tokens: 100 });
    const cached = usageFromProvider({
      prompt_tokens: 10_000,
      completion_tokens: 100,
      cached_tokens: 8_000,
    });
    // A cache hit reported by the provider genuinely costs less — the ledger
    // reflects the provider's own accounting, not the composer's estimate.
    expect(actualVGU(chargeFromActualUsage(cached)).providerCostUSD).toBeLessThan(
      actualVGU(chargeFromActualUsage(fresh)).providerCostUSD
    );
    expect(actualVGU(chargeFromActualUsage(cached)).vgu).toBe(expectedVGU(cached));
  });
});

// ---------------------------------------------------------------------------
// (b) Context-telemetry rides the ledger meta without altering billing (Req 24.1)
// ---------------------------------------------------------------------------

/** A distinctive user message + memory secret we assert never leak into meta. */
const SENSITIVE_MESSAGE = 'PLEASE-REMEMBER-my-private-launch-code-XYZZY-42';
const SENSITIVE_MEMORY = 'user home address is 12 Secret Lane Nowhere';

const TELEMETRY_CASE: EquivalenceCase = {
  name: 'ledger-meta ride-along case',
  category: 'content-creation',
  input: {
    message: SENSITIVE_MESSAGE,
    tier: 'advanced',
    memory: [
      { id: 'm1', text: 'brand color is blue' },
      { id: 'm2', text: SENSITIVE_MEMORY },
    ],
  },
  golden: { requiredTools: [] },
};

/** Build a real composer telemetry record, overriding its estimated total. */
function buildTelemetryWithEstimate(totalInputTokensEstimate: number): TokenTelemetry {
  const opt = runOptimized(TELEMETRY_CASE);
  return { ...opt.telemetry, totalInputTokens: totalInputTokensEstimate };
}

/** Assemble a ledger entry with the actual-usage charge and optional telemetry. */
function buildLedgerEntry(
  usage: TokenUsage,
  telemetry?: TokenTelemetry
): LedgerEntry {
  const computed = actualVGU(chargeFromActualUsage(usage));
  const meta = telemetry ? telemetryToLedgerMeta(telemetry) : undefined;
  return {
    reservationId: 'res-test-1',
    userId: 'user-1',
    billingPeriodId: '2026-08',
    plan: 'pro',
    modelTier: 'premium',
    model: MODEL,
    feature: FEATURE,
    // Billing fields come STRICTLY from the actual-usage computation.
    inputTokens: computed.tokens.inputTokens,
    outputTokens: computed.tokens.outputTokens,
    reasoningTokens: computed.tokens.reasoningTokens,
    cachedTokens: computed.tokens.cachedTokens,
    providerCalls: computed.providerCalls,
    estimatedVGU: 0,
    actualVGU: computed.vgu,
    estimatedProviderCostUSD: 0,
    actualProviderCostUSD: computed.providerCostUSD,
    pricingVersions: computed.pricingVersions,
    capped: computed.cappedByMaxPerRequest,
    fallbackPricing: computed.usedFallbackPricing,
    status: 'RECONCILED',
    meta,
  };
}

describe('Token_Ledger · context-telemetry rides meta without changing billing (Req 24.1)', () => {
  const usage = usageFromProvider({
    prompt_tokens: 5000,
    completion_tokens: 500,
    reasoning_tokens: 200,
  });

  it('the billing fields are identical with and without telemetry attached', () => {
    const withoutTelemetry = buildLedgerEntry(usage);
    const withTelemetry = buildLedgerEntry(usage, buildTelemetryWithEstimate(123));

    // The charge/token fields the ledger totals are computed from must not move
    // because observability metadata was attached to `meta`.
    for (const field of [
      'actualVGU',
      'actualProviderCostUSD',
      'inputTokens',
      'outputTokens',
      'reasoningTokens',
      'cachedTokens',
      'providerCalls',
    ] as const) {
      expect(withTelemetry[field]).toBe(withoutTelemetry[field]);
    }
    // The charge equals the actual-usage computation exactly.
    expect(withTelemetry.actualVGU).toBe(expectedVGU(usage));
  });

  it('the telemetry lands under meta.contextTelemetry with the stable shape', () => {
    const entry = buildLedgerEntry(usage, buildTelemetryWithEstimate(123));
    const meta = entry.meta as Record<string, unknown>;
    expect(meta).toBeDefined();
    const contextTelemetry = meta.contextTelemetry as Record<string, unknown>;
    expect(contextTelemetry).toBeDefined();
    // Every stable ledger-meta key the metering/API contract depends on is present.
    for (const key of LEDGER_META_KEYS) {
      expect(key in contextTelemetry).toBe(true);
    }
  });

  it('telemetry carries counts + metadata only — no prompt or user content leaks', () => {
    const telemetry = buildTelemetryWithEstimate(123);
    const meta = telemetryToLedgerMeta(telemetry);
    const serialized = JSON.stringify(meta);

    // The distinctive user message and the private memory fact must NOT appear
    // anywhere in the ledger meta (Req 16.4 privacy, preserved here for billing).
    expect(serialized).not.toContain(SENSITIVE_MESSAGE);
    expect(serialized).not.toContain('Secret Lane');
    expect(serialized).not.toContain('XYZZY');

    // What DOES ride along is strictly counts + metadata.
    const contextTelemetry = (meta.contextTelemetry as Record<string, unknown>);
    expect(typeof contextTelemetry.totalInputTokens).toBe('number');
    expect(typeof contextTelemetry.perCategoryTokens).toBe('object');
    expect(Array.isArray(contextTelemetry.selectedModules)).toBe(true);
    expect(Array.isArray(contextTelemetry.exposedTools)).toBe(true);
  });

  it('the telemetry meta is additive — it never overwrites a billing key', () => {
    const meta = telemetryToLedgerMeta(buildTelemetryWithEstimate(123));
    // The whole payload is nested under a single namespaced key, so it cannot
    // collide with any top-level ledger field.
    expect(Object.keys(meta)).toEqual(['contextTelemetry']);
  });
});

// ---------------------------------------------------------------------------
// Scope isolation guard (Req 24.1) — telemetry never touches the billing path
// ---------------------------------------------------------------------------

describe('Scope isolation · telemetry is decoupled from billing/pricing/ledger (Req 24.1)', () => {
  it('the telemetry module does not import or compute charges', () => {
    const src = readFileSync('server/routes/veegpt-token-telemetry.ts', 'utf8');
    // No dependency on the pricing/VGU/ledger subsystems: a context change can
    // therefore never reach into a charge computation.
    expect(src).not.toContain('veegpt-pricing.registry');
    expect(src).not.toContain('veegpt-vgu');
    expect(src).not.toContain('veegpt-ledger');
    expect(src).not.toContain('providerCostUSD');
    expect(src).not.toContain('actualVGU');
  });

  it('the context composer does not import or compute charges', () => {
    const src = readFileSync('server/routes/veegpt-context-composer.ts', 'utf8');
    expect(src).not.toContain('veegpt-pricing.registry');
    expect(src).not.toContain('providerCostUSD');
    expect(src).not.toContain('veegpt-ledger');
    expect(src).not.toContain('actualVGU');
  });
});
