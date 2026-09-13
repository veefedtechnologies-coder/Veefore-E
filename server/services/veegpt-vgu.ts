/**
 * VGU arithmetic — pure, no I/O, fully unit-testable.
 *
 * Two distinct numbers, and the difference matters:
 *
 *   estimateVGU()  runs BEFORE the provider call, when token counts are unknown.
 *                  It uses the feature's base VGU × the model tier multiplier ×
 *                  tool overhead. This is what gets atomically reserved.
 *
 *   actualVGU()    runs AFTER the call, from provider-reported tokens priced
 *                  through the versioned pricing registry. This is what the user
 *                  is finally charged, and it is reconciled against the
 *                  reservation (release the surplus, or top up the shortfall).
 *
 * The tier multipliers (1 / 3 / 12 / 20) are therefore ESTIMATES, never the
 * permanent truth. Measured against the anchor, a real premium turn lands around
 * 16 VGU rather than 12 — actual accounting protects the business where a flat
 * multiplier would not.
 */

import {
  featureSpec,
  MIN_VGU_PER_REQUEST,
  roundVGU,
  TIER_MULTIPLIER,
  VGU_ANCHOR_USD,
  type ModelTier,
} from '../config/veegpt-vgu.config';
import { modelTierOf } from '@shared/veegpt-model-tiers';
import {
  providerCostUSD,
  type CostBreakdown,
  type TokenUsage,
} from '../config/veegpt-pricing.registry';
import {
  adminFeatureMultiplier,
  adminTierMultiplier,
} from './veegpt-admin-controls';

// ---------------------------------------------------------------------------
// Estimation (pre-flight)
// ---------------------------------------------------------------------------

export interface EstimateInput {
  /** AIFeature label, e.g. 'veegpt.chat'. */
  feature: string;
  /** App-level model id the request will use. */
  model?: string;
  /** Tools/actions expected this turn (each adds its own base). */
  tools?: string[];
  /** Number of media attachments to be analysed. */
  attachments?: number;
  /** Prompt size in characters, when known — scales the estimate for very
   *  large contexts so a 200k-token prompt is not estimated as a small one. */
  promptChars?: number;
}

/** Extra estimated VGU for expensive tools, on top of the model request. */
export const TOOL_BASE_VGU: Record<string, number> = {
  deep_research: 40,
  search_web: 4,
  research_trends: 4,
  get_analytics_insight: 2,
  get_account_details: 1,
};

/** Characters of prompt that count as one "reference-size" request. */
const REFERENCE_PROMPT_CHARS = 17_600;

/**
 * How far above the point estimate a fan-out job realistically lands.
 *
 * Measured: a deep-research job estimated at 40 VGU reconciled at ~76. 2.5× keeps
 * the upper bound honest without quoting the absolute worst case, which would make
 * every estimate look alarming.
 */
const VARIANCE_HIGH_MULTIPLE = 2.5;

/**
 * Pre-flight VGU estimate. Deliberately conservative (rounds up): reserving
 * slightly too much is corrected by reconciliation, whereas reserving too little
 * lets concurrent requests overspend the quota.
 */
export function estimateVGU(input: EstimateInput): number {
  const spec = featureSpec(input.feature);
  const tier = modelTierOf(input.model);
  const tierMult = TIER_MULTIPLIER[tier];

  // Large prompts genuinely cost more; scale the base by context size when we
  // know it, never below 1×.
  const ctxScale = input.promptChars
    ? Math.max(1, input.promptChars / REFERENCE_PROMPT_CHARS)
    : 1;

  // Emergency admin overrides (spec §48): an operator can dial the tier or
  // feature estimate multiplier down during a cost incident, without a redeploy.
  // These affect only the pre-flight RESERVATION; the final charge is still
  // reconciled from real tokens. An override of 0 is honoured (reserve nothing
  // up front) but the MIN_VGU floor still applies at the end.
  const tierOverride = adminTierMultiplier(tier);
  const featureOverride = adminFeatureMultiplier(input.feature);
  const effTierMult = tierOverride !== undefined ? tierOverride : tierMult;
  const effToolMult = featureOverride !== undefined ? featureOverride : spec.toolMultiplier;

  let vgu = spec.baseVGU * effTierMult * effToolMult * ctxScale;

  // Tool surcharges are flat: their cost is dominated by fan-out and paid search
  // APIs, not by the chat model, so they must not be multiplied by the tier.
  for (const tool of input.tools || []) {
    vgu += TOOL_BASE_VGU[tool] ?? 0;
  }

  const mediaSpec = featureSpec('veegpt.media_analysis');
  if (input.attachments && input.attachments > 0) {
    vgu += input.attachments * mediaSpec.baseVGU;
  }

  return clampVGU(vgu, spec.maxVGUPerRequest);
}

/**
 * A pre-flight estimate RANGE, for showing the user what an expensive job may
 * cost before they start it (spec §22: "Estimated VeeGPT usage: ~40–100 VGU").
 *
 * A single number would be dishonest for a fan-out feature: deep research on a
 * narrow question and on a broad one differ by several times, and the observed
 * spread is roughly 1×–2.5× the base estimate. The high end is clamped to the
 * feature's hard per-job ceiling, so the range never promises something the engine
 * would refuse to bill.
 */
export function estimateVGURange(input: EstimateInput): {
  low: number;
  high: number;
  ceiling: number;
} {
  const spec = featureSpec(input.feature);
  const low = estimateVGU(input);
  const high = clampVGU(low * VARIANCE_HIGH_MULTIPLE, spec.maxVGUPerRequest);
  return {
    low: Math.round(low),
    high: Math.round(Math.max(high, low)),
    ceiling: spec.maxVGUPerRequest,
  };
}

/** Apply the per-request floor and ceiling, and round to tracked precision. */
export function clampVGU(vgu: number, maxPerRequest: number): number {
  const floored = Math.max(MIN_VGU_PER_REQUEST, vgu);
  const capped = Math.min(floored, maxPerRequest);
  return roundVGU(capped);
}

// ---------------------------------------------------------------------------
// Actual accounting (post-flight)
// ---------------------------------------------------------------------------

/** One provider call's measured usage. */
export interface ProviderCall {
  model: string;
  usage: TokenUsage;
  /** When the call happened — selects the pricing version in force. */
  at?: Date;
}

export interface ActualVGUInput {
  feature: string;
  /** Every provider call the request made (deep research makes many). */
  calls: ProviderCall[];
  /** Tools that actually ran. */
  tools?: string[];
  /** Media attachments actually analysed. */
  attachments?: number;
  /**
   * Real money paid to non-LLM providers for this request (Tavily/Firecrawl
   * search, image generation, transcription). Counted at the same anchor so a
   * paid search API is not invisible to the budget.
   */
  externalCostUSD?: number;
}

/** Summed token counts across every provider call of one request. */
export interface AggregatedTokens {
  inputTokens: number;
  /** Total completion tokens — includes reasoning. */
  outputTokens: number;
  /** Reasoning subset of outputTokens. */
  reasoningTokens: number;
  /** Cached subset of inputTokens. */
  cachedTokens: number;
}

export interface ActualVGUResult {
  /** Final VGU to charge, after floor/ceiling. */
  vgu: number;
  /** Total provider cost in USD across all calls plus external services. */
  providerCostUSD: number;
  /** Pricing versions used, for the audit ledger. */
  pricingVersions: string[];
  /** Number of provider calls observed. */
  providerCalls: number;
  /** Aggregate token counts, for the ledger. */
  tokens: AggregatedTokens;
  /** True when the ceiling clipped the charge (indicates a runaway request). */
  cappedByMaxPerRequest: boolean;
  /** True when any call had to use conservative fallback pricing. */
  usedFallbackPricing: boolean;
}

/**
 * Final VGU from measured provider usage.
 *
 * VGU = (total provider cost) / (cost of one reference cheap request)
 *
 * This is what makes the system honest: a premium request that genuinely burned
 * 40k tokens costs more than one that burned 2k, and the same model on a huge
 * context is not charged as if it were small.
 */
export function actualVGU(input: ActualVGUInput): ActualVGUResult {
  const spec = featureSpec(input.feature);
  const tokens: AggregatedTokens = {
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    cachedTokens: 0,
  };
  const pricingVersions: string[] = [];
  let costUSD = 0;
  let usedFallbackPricing = false;

  for (const call of input.calls) {
    const cost: CostBreakdown = providerCostUSD(
      call.model,
      call.usage,
      call.at ?? new Date()
    );
    costUSD += cost.usd;
    if (cost.estimated) usedFallbackPricing = true;
    if (!pricingVersions.includes(cost.pricingVersion)) {
      pricingVersions.push(cost.pricingVersion);
    }
    tokens.inputTokens += Math.max(0, call.usage.inputTokens || 0);
    tokens.outputTokens += Math.max(0, call.usage.outputTokens || 0);
    tokens.reasoningTokens += Math.max(0, call.usage.reasoningTokens || 0);
    tokens.cachedTokens += Math.max(0, call.usage.cachedTokens || 0);
  }

  // Paid non-LLM services (search, image gen) are real money and must land in
  // the same unit, otherwise deep research looks almost free.
  costUSD += Math.max(0, input.externalCostUSD || 0);

  // Convert money → normalized units.
  let vgu = costUSD / VGU_ANCHOR_USD;

  // Media surcharge (spec §21). An image/video analysis costs more than a bare
  // text turn, but the vision cost is folded into the model's INPUT tokens rather
  // than a separate provider invoice — and on a cheap vision model those tokens
  // are nearly free. So a flat +3 VGU baseline per attachment is applied on top of
  // the measured token cost, matching the pre-flight estimate, so an image upload
  // is never charged as if it were a plain message.
  const mediaBaseVGU = featureSpec('veegpt.media_analysis').baseVGU;
  if (input.attachments && input.attachments > 0) {
    vgu += input.attachments * mediaBaseVGU;
  }

  // NOTE on tools (spec §20/§22): a web search or a research fan-out is NOT given
  // a flat VGU surcharge here. Its real, itemised provider spend — paid search
  // API fees on top of the LLM tokens — is recorded during the operation via
  // `recordExternalCostUSD` and is already included in `costUSD` above. Adding a
  // flat tool figure on top of that measured cost would DOUBLE-charge the same
  // search. The pre-flight ESTIMATE still reserves the tool baselines (+4 search,
  // +40 research) so enough quota is held up front; reconciliation then charges
  // the actual cost, which is exactly what §20 requires ("reconcile against
  // actual usage"). `input.tools` is retained on the type for that estimate path
  // and for callers that inspect it.
  void input.tools;

  const beforeCap = roundVGU(Math.max(MIN_VGU_PER_REQUEST, vgu));
  const vguFinal = clampVGU(vgu, spec.maxVGUPerRequest);

  return {
    vgu: vguFinal,
    providerCostUSD: costUSD,
    pricingVersions,
    providerCalls: input.calls.length,
    tokens,
    cappedByMaxPerRequest: beforeCap > spec.maxVGUPerRequest,
    usedFallbackPricing,
  };
}

/** VGU equivalent of a raw USD amount (for image/video/search-only charges). */
export function vguFromUSD(usd: number): number {
  return roundVGU(Math.max(0, usd) / VGU_ANCHOR_USD);
}

/** The tier a model belongs to (re-exported for callers doing eligibility). */
export function tierOf(model?: string): ModelTier {
  return modelTierOf(model);
}
