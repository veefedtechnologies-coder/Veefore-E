/**
 * Provider pricing registry — spec §47.
 *
 * The ONE place provider prices live. Route logic, credit metering, and VGU
 * accounting all read from here; nothing hard-codes a token price.
 *
 * VERSIONED ON PURPOSE. Provider prices change, and a usage event written in
 * March must keep the price that applied in March or every historical cost report
 * silently rewrites itself. Each entry carries `effectiveFrom` / `effectiveTo`,
 * and `priceFor(model, at)` resolves the row in force at that instant. The
 * resolved `pricingVersion` is stamped onto every usage event.
 *
 * This registry replaces three duplicated hard-coded tables that had already
 * drifted apart:
 *   - server/services/aiUsageTracker.ts            AI_PRICING (USD)
 *   - AICreditMeteringService.ts                   MODEL_PRICES (INR, regex)
 *   - subscription.controller.ts                   BILLING_AI_PRICING_USD
 */

import { nativeModelFor } from '../services/ai-model-routing';

/** Prices are per 1,000,000 tokens, in the entry's currency. */
export interface ModelPrice {
  /** Stable identifier for this exact price row, stamped onto usage events. */
  pricingVersion: string;
  provider: 'openai' | 'gemini' | 'anthropic' | 'perplexity' | 'other';
  /** Provider-native model id this row prices. */
  model: string;
  /** Optional provider model version/snapshot, when the provider exposes one. */
  modelVersion?: string;
  currency: 'USD';
  /** Fresh (uncached) input tokens, per 1M. */
  input: number;
  /** Output tokens, per 1M. */
  output: number;
  /**
   * Reasoning tokens, per 1M. OpenAI bills reasoning tokens at the OUTPUT rate
   * and reports them inside `completion_tokens_details`, so this defaults to the
   * output price rather than zero — treating them as free understated the cost of
   * every GPT-5 request.
   */
  reasoning?: number;
  /**
   * Cached input tokens, per 1M. OpenAI/Gemini prompt caching bills these at
   * roughly 10% of the fresh input rate.
   */
  cachedInput?: number;
  effectiveFrom: string;
  /** null = currently in force. */
  effectiveTo: string | null;
}

/** Fraction of the input rate charged for cached prompt tokens when unspecified. */
export const DEFAULT_CACHED_INPUT_RATIO = 0.1;

/**
 * Every price row we know. Ordered newest-last per model; `priceFor` picks by
 * date so superseding a price means adding a row and closing the old one, never
 * editing history.
 */
export const PRICING_REGISTRY: ModelPrice[] = [
  // ── OpenAI ───────────────────────────────────────────────────────────────
  // Verified against developers.openai.com/api/docs/pricing (standard tier,
  // short-context, per 1M tokens) on 2026-08-10. Input / output / cached-input
  // are all the PUBLISHED rates. gpt-4o bills cached prompt tokens at 50% of the
  // fresh rate and the gpt-4.1 family at 25%, so those are set explicitly; the
  // gpt-5 family's cached rate genuinely IS the 10% default, so it is left implicit.
  p('openai', 'gpt-4o-mini', 0.15, 0.6, { cachedInput: 0.075 }),
  p('openai', 'gpt-4o', 2.5, 10.0, { cachedInput: 1.25 }),
  p('openai', 'gpt-4.1', 2.0, 8.0, { cachedInput: 0.5 }),
  p('openai', 'gpt-4.1-mini', 0.4, 1.6, { cachedInput: 0.1 }),
  p('openai', 'gpt-4.1-nano', 0.1, 0.4, { cachedInput: 0.025 }),
  p('openai', 'gpt-5-nano', 0.05, 0.4),
  p('openai', 'gpt-5-mini', 0.25, 2.0),
  p('openai', 'gpt-5', 1.25, 10.0),
  // gpt-5.5 and the gpt-5.6 family were previously priced at a fabricated
  // 1.75/14.0. Corrected to the published standard rates on 2026-08-10.
  p('openai', 'gpt-5.5', 5.0, 30.0, { pricingVersion: 'gpt-5.5@2026-08-10' }),
  p('openai', 'gpt-5.6-sol', 5.0, 30.0, { pricingVersion: 'gpt-5.6-sol@2026-08-10' }),
  p('openai', 'gpt-5.6-luna', 0.2, 1.2, { pricingVersion: 'gpt-5.6-luna@2026-08-10' }),
  p('openai', 'gpt-5.6-terra', 2.0, 12.0, { pricingVersion: 'gpt-5.6-terra@2026-08-10' }),

  // ── Google Gemini ────────────────────────────────────────────────────────
  // Verified against ai.google.dev/gemini-api/docs/pricing and corroborating
  // 2026 sources on 2026-08-10 (per 1M tokens, <=200k-context tier).
  // The `-latest` aliases track Google's current 2.5-generation Flash/Pro, which
  // is what the routing layer points them at.
  p('gemini', 'gemini-flash-lite-latest', 0.1, 0.4),
  p('gemini', 'gemini-flash-latest', 0.3, 2.5),
  p('gemini', 'gemini-pro-latest', 1.25, 10.0),
  // The explicit Gemini 3.x rows were previously copied from the 2.5 rates.
  // Corrected to the published Gemini 3 pricing on 2026-08-10.
  p('gemini', 'gemini-3.5-flash', 1.5, 9.0, { pricingVersion: 'gemini-3.5-flash@2026-08-10' }),
  p('gemini', 'gemini-3.6-flash', 1.5, 7.5, { pricingVersion: 'gemini-3.6-flash@2026-08-10' }),
  p('gemini', 'gemini-3.1-pro-preview', 2.0, 12.0, { pricingVersion: 'gemini-3.1-pro-preview@2026-08-10' }),

  // ── Anthropic (via gateway) ──────────────────────────────────────────────
  p('anthropic', 'claude-3-5-haiku', 0.8, 4.0),
  p('anthropic', 'claude-3-5-sonnet', 3.0, 15.0),

  // ── Perplexity (via gateway) ─────────────────────────────────────────────
  p('perplexity', 'perplexity-sonar', 1.0, 1.0),
];

/** Build a price row with the defaults applied. */
function p(
  provider: ModelPrice['provider'],
  model: string,
  input: number,
  output: number,
  opts: Partial<ModelPrice> = {}
): ModelPrice {
  return {
    pricingVersion: opts.pricingVersion ?? `${model}@2026-08-01`,
    provider,
    model,
    currency: 'USD',
    input,
    output,
    // Reasoning tokens bill at the output rate unless a provider says otherwise.
    reasoning: opts.reasoning ?? output,
    cachedInput: opts.cachedInput ?? input * DEFAULT_CACHED_INPUT_RATIO,
    effectiveFrom: opts.effectiveFrom ?? '2026-01-01T00:00:00.000Z',
    effectiveTo: opts.effectiveTo ?? null,
    modelVersion: opts.modelVersion,
    ...opts,
  };
}

/**
 * A model with no price row. Deliberately EXPENSIVE: an unpriced model must
 * never look cheap, or an unknown frontier model becomes a free-usage hole.
 * Mirrors the conservative fallback the credit service already used.
 */
export const UNKNOWN_MODEL_PRICE: ModelPrice = {
  pricingVersion: 'unknown@conservative',
  provider: 'other',
  model: '(unknown)',
  currency: 'USD',
  // Deliberately above EVERY row in the registry above, so an unpriced model can
  // never be cheaper than a priced one. A test asserts this invariant, because
  // adding a pricier model later would otherwise silently make "unknown" the
  // bargain option. The most expensive real row is now gpt-5.5 / gpt-5.6-sol at
  // $5 in / $30 out, so this sits clearly above both.
  input: 7.5,
  output: 40.0,
  reasoning: 40.0,
  cachedInput: 0.75,
  effectiveFrom: '1970-01-01T00:00:00.000Z',
  effectiveTo: null,
};

/**
 * Reduce any model id the codebase can hand us to the PROVIDER id this registry
 * is keyed by.
 *
 * Three naming systems reach this function:
 *   1. provider ids            `gpt-4o-mini`            (what an invoice shows)
 *   2. gateway-prefixed ids    `openai/gpt-4o-mini`
 *   3. APP-level ids           `openai-gpt4o`, `veegpt-hybrid`, `gemini-2.5-pro`
 *
 * (3) is the important one and was the source of a real over-charge: the whole
 * VeeGPT chat path records the app id it routed (AIServiceManager logs
 * `openai-gpt-5-nano`, not `gpt-5-nano`), so every one of those lookups missed
 * the registry and was billed at UNKNOWN_MODEL_PRICE — $5/$20 per 1M instead of
 * $0.05/$0.40. App ids are therefore resolved through the routing registry,
 * which is the single authoritative app→provider mapping.
 */
function normalizeModelId(model: string): string {
  const raw = String(model || '')
    .replace(/^(openai|gemini|google|anthropic|perplexity)\//, '')
    .trim();
  if (!raw) return raw;
  // An app-level id resolves to its provider-native id. Ids that are already
  // provider ids are not in the routing registry and pass through untouched.
  return nativeModelFor(raw) ?? raw;
}

/**
 * Longest registry id that `id` extends at a `-` boundary.
 *
 * WHY THIS EXISTS — a real over-charge found by measurement.
 * Providers echo back a DATED SNAPSHOT id, not the alias you requested:
 * asking for `gpt-4o-mini` yields `gpt-4o-mini-2024-07-18`. The guard records
 * whatever the provider reported, so every such call missed the registry and was
 * priced with UNKNOWN_MODEL_PRICE — $5/$20 per 1M instead of $0.15/$0.60. One
 * observed landing-demo request was billed 2.46 VGU instead of ~1: a ~30×
 * over-charge on cost, on every guarded legacy path.
 *
 * Matching at a `-` boundary and taking the LONGEST match is what keeps
 * `gpt-4o-mini-2024-07-18` on the mini row rather than collapsing it onto
 * `gpt-4o`, which would have been an under-charge instead.
 */
function longestPrefixModel(id: string): string | undefined {
  let best: string | undefined;
  for (const row of PRICING_REGISTRY) {
    const m = row.model;
    if (id === m) return m;
    if (!id.startsWith(m)) continue;
    // Only a RECOGNISABLE snapshot/version suffix counts. An arbitrary unknown
    // variant ("gpt-4o-minix") must stay unpriced and get the conservative rate,
    // because guessing which family it belongs to is how a new model ends up
    // mispriced.
    if (!SNAPSHOT_SUFFIX.test(id.slice(m.length))) continue;
    if (!best || m.length > best.length) best = m;
  }
  return best;
}

/**
 * Suffixes providers append to a model alias to name a specific build:
 *   -2024-07-18   dated snapshot (OpenAI)
 *   -20240718     compact date
 *   -latest / -preview / -exp    moving pointers
 *   -001 / -v2                   revision counters
 */
const SNAPSHOT_SUFFIX =
  /^-(\d{4}-\d{2}-\d{2}|\d{6,8}|latest|preview|exp|v?\d{1,3})$/;

/**
 * Resolve the price row in force for `model` at instant `at` (default: now).
 * Returns `UNKNOWN_MODEL_PRICE` when the model is unpriced, so callers always
 * get a usable — and conservative — number.
 */
export function priceFor(model: string, at: Date = new Date()): ModelPrice {
  const normalized = normalizeModelId(model);
  // Exact id first; otherwise the dated-snapshot form of a known model.
  const id = longestPrefixModel(normalized) ?? normalized;
  const t = at.getTime();
  const rows = PRICING_REGISTRY.filter(r => r.model === id);
  const inForce = rows.find(r => {
    const from = new Date(r.effectiveFrom).getTime();
    const to = r.effectiveTo ? new Date(r.effectiveTo).getTime() : Infinity;
    return t >= from && t < to;
  });
  return inForce ?? rows[rows.length - 1] ?? UNKNOWN_MODEL_PRICE;
}

/** Whether we have a real price for this model (false = conservative fallback). */
export function isPriced(model: string): boolean {
  return priceFor(model) !== UNKNOWN_MODEL_PRICE;
}

/**
 * USD → INR conversion, used only where the product already prices in rupees
 * (the AI credit ledger). Configurable via `AI_USD_TO_INR` because a hard-coded
 * FX rate silently distorts credit costs when the rate moves.
 *
 * The default is 84 because that is the rate the retired INR table was built at
 * ($0.15 × 84 = ₹12.6 per 1M; $2.50 × 84 = ₹210), so credit charges are
 * reproduced exactly rather than shifted ~1.2% by an arbitrary new rate.
 */
export function usdToInr(): number {
  const raw = Number(process.env.AI_USD_TO_INR);
  return Number.isFinite(raw) && raw > 0 ? raw : 84;
}

/**
 * Token counts as reported by a provider (all optional; missing = 0).
 *
 * CONTRACT — read this before changing cost maths:
 *  • `outputTokens` is the provider's TOTAL completion count.
 *  • `reasoningTokens` is a BREAKDOWN of that total, not an addition to it.
 *    OpenAI reports `completion_tokens_details.reasoning_tokens` inside
 *    `completion_tokens`; Gemini reports `thoughtsTokenCount` inside
 *    `candidatesTokenCount`. Adding it again would double-charge every
 *    reasoning model, so cost is computed from `outputTokens` alone and
 *    `reasoningTokens` is carried for reporting.
 *  • `cachedTokens` is likewise a subset of `inputTokens`.
 */
export interface TokenUsage {
  inputTokens?: number;
  /** Total completion tokens — INCLUDES reasoning tokens. */
  outputTokens?: number;
  /** Reasoning subset of `outputTokens`, for reporting. Not added to cost. */
  reasoningTokens?: number;
  /** Subset of inputTokens served from the provider's prompt cache. */
  cachedTokens?: number;
  /**
   * Set only for a provider that bills reasoning SEPARATELY from completion
   * tokens. No current provider does; the flag exists so such a provider can be
   * priced correctly without changing the default (and safe) interpretation.
   */
  reasoningBilledSeparately?: boolean;
}

export interface CostBreakdown {
  /** Total provider cost in USD. */
  usd: number;
  pricingVersion: string;
  provider: ModelPrice['provider'];
  /** True when no real price row existed and the conservative fallback was used. */
  estimated: boolean;
}

/**
 * Actual provider cost of one call, from real token counts.
 *
 * Cached input is billed at the discounted cached rate and removed from fresh
 * input — previously ignored, which overstated cost on cache hits.
 *
 * Reasoning tokens are NOT added on top: providers report them inside the
 * completion count (see the TokenUsage contract). Charging them again would
 * inflate every GPT-5 request by the size of its hidden reasoning, which for a
 * heavy reasoning pass can be several times the visible answer.
 */
export function providerCostUSD(
  model: string,
  usage: TokenUsage,
  at: Date = new Date()
): CostBreakdown {
  const price = priceFor(model, at);
  const input = Math.max(0, usage.inputTokens || 0);
  const cached = Math.max(0, Math.min(usage.cachedTokens || 0, input));
  const fresh = input - cached;
  const output = Math.max(0, usage.outputTokens || 0);
  const reasoning = Math.max(0, usage.reasoningTokens || 0);

  let usd =
    (fresh / 1_000_000) * price.input +
    (cached / 1_000_000) *
      (price.cachedInput ?? price.input * DEFAULT_CACHED_INPUT_RATIO) +
    (output / 1_000_000) * price.output;

  // Only when a provider bills reasoning outside the completion count.
  if (usage.reasoningBilledSeparately && reasoning > 0) {
    usd += (reasoning / 1_000_000) * (price.reasoning ?? price.output);
  }

  return {
    usd,
    pricingVersion: price.pricingVersion,
    provider: price.provider,
    estimated: price === UNKNOWN_MODEL_PRICE,
  };
}

/**
 * Same cost expressed in INR, for the rupee-denominated AI credit ledger.
 * Exists so the credit service does not need its own price table.
 */
export function providerCostINR(
  model: string,
  usage: TokenUsage,
  at: Date = new Date()
): number {
  return providerCostUSD(model, usage, at).usd * usdToInr();
}
