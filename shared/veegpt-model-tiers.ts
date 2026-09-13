/**
 * VeeGPT model tiers — ONE authoritative map, shared by server and client.
 *
 * Internal tier ids follow the production specification (cheap / medium /
 * premium / ultra). The user-facing labels are Light / Standard / Premium /
 * Ultra — the words shown on the Settings → AI Configuration cards. Keeping both
 * in one file means the tier the budget charges can never disagree with the
 * badge the user sees.
 *
 * IMPORTANT: the multipliers here are ESTIMATE multipliers only. They are used
 * before a request runs, when the token count is not yet known. The final charge
 * is recomputed from ACTUAL provider token usage against the versioned pricing
 * registry (server/config/veegpt-pricing.registry.ts) and reconciled. Nothing in
 * this system permanently charges a flat 1/3/12/20 per request.
 */

/** Internal cost tier of a model. */
export type ModelTier = 'cheap' | 'medium' | 'premium' | 'ultra';

/** cheap < medium < premium < ultra. */
export const TIER_ORDER: Record<ModelTier, number> = {
  cheap: 0,
  medium: 1,
  premium: 2,
  ultra: 3,
};

/**
 * Baseline VGU multiplier per tier, used for the PRE-FLIGHT ESTIMATE.
 * 1 VGU ≈ one lightweight request on a cheap model.
 */
export const TIER_MULTIPLIER: Record<ModelTier, number> = {
  cheap: 1,
  medium: 3,
  premium: 12,
  ultra: 20,
};

/** What the user sees. */
export const TIER_LABEL: Record<ModelTier, string> = {
  cheap: 'Light',
  medium: 'Standard',
  premium: 'Premium',
  ultra: 'Ultra',
};

/** Short explanation of relative cost, for the Settings cards. */
export const TIER_BLURB: Record<ModelTier, string> = {
  cheap: 'Lowest usage — best for everyday chat',
  medium: 'Uses about 3× a Light reply',
  premium: 'Uses about 12× a Light reply',
  ultra: 'Uses about 20× a Light reply — tightly limited',
};

/**
 * Every model id the AI Configuration screen can store → its tier.
 * Must cover the routing REGISTRY exactly; tests/veegpt-vgu.test.ts asserts
 * parity in both directions so a new model can never be silently mispriced.
 */
export const MODEL_TIER: Record<string, ModelTier> = {
  // ── Cheap: flash-lite / nano / cheap mini ────────────────────────────────
  'veegpt-hybrid': 'cheap',
  'google-ai-studio': 'cheap',
  'gemini-1.5-flash': 'cheap',
  'gemini-2.5-flash-lite': 'cheap',
  'gemini-flash-lite-latest': 'cheap',
  'openai-gpt-4o-mini': 'cheap',
  'openai-gpt-4.1-nano': 'cheap',
  'openai-gpt-5-nano': 'cheap',
  // Retired GitHub ids are canonicalised to their OpenAI twins before pricing,
  // but stay classed so a stale stored id is never "unknown".
  'github-gpt-4o-mini': 'cheap',

  // ── Medium: flash / mini-reasoning / mid-tier (~$1–$4 per 1M output) ──────
  'gemini-2.0-flash-exp': 'medium',
  'gemini-2.5-flash': 'medium',
  'gemini-flash-latest': 'medium',
  'openai-gpt-4.1-mini': 'medium',
  'openai-gpt-5-mini': 'medium',
  // gpt-5.6-luna is a genuinely cheap flagship-family model ($0.20/$1.20 per 1M)
  // — it was mistakenly grouped with the costly gpt-5.6 siblings. It sits with
  // the other mid-priced minis.
  'openai-gpt-5.6-luna': 'medium',
  // claude-3-5-haiku ($0.80/$4.00) costs several times a Light reply on output,
  // so it is Standard, not Light.
  'claude-3-5-haiku': 'medium',
  'perplexity-sonar': 'medium',
  'github-gpt-4.1-mini': 'medium',

  // ── Premium: frontier / pro (~$8–$15 per 1M output) ──────────────────────
  'gemini-2.5-pro': 'premium',
  'gemini-pro-latest': 'premium',
  'gemini-3.1-pro': 'premium',
  // Google's Gemini 3.x "flash" tiers are priced like premium models
  // ($7.50–$9.00 per 1M output), NOT like the 2.5 flash line — cost, not the
  // "flash" name, decides the tier.
  'gemini-3.5-flash': 'premium',
  'gemini-3.6-flash': 'premium',
  'openai-gpt4o': 'premium',
  // gpt-4.1 is $2/$8 per 1M — within ~20% of gpt-4o, so it prices as premium,
  // NOT as a sibling of gpt-4.1-mini.
  'openai-gpt-4.1': 'premium',
  'openai-gpt-5': 'premium',
  'openai-gpt-5.6-terra': 'premium',
  // claude-3-5-sonnet ($3/$15) is a frontier-priced model, above every Standard
  // model — premium, not medium.
  'claude-3-5-sonnet': 'premium',

  // ── Ultra: the most expensive frontier models (~$30 per 1M output) ────────
  // These cost ~3x a premium model, so they carry the tightest allowances and
  // the highest estimate multiplier. Free/Creator cannot use them at all; Pro and
  // Business get a limited allowance (spec §6, §18).
  'openai-gpt-5.5': 'ultra',
  'openai-gpt-5.6-sol': 'ultra',
};

/**
 * An unrecognised id is treated as PREMIUM. Guessing "cheap" for an unknown
 * model is the one mistake that costs real money, and new frontier models are
 * exactly what appears without a pricing entry. (Not ULTRA: that would wrongly
 * deny access on plans that exclude ultra, turning a pricing gap into an outage.
 * Premium is the safe middle — charged heavily, still runnable on paid plans.)
 */
export const UNKNOWN_MODEL_TIER: ModelTier = 'premium';

/** Tier of a model id. Unknown ids are premium (fail safe on cost). */
export function modelTierOf(aiModel?: string): ModelTier {
  // No stored selection → the app default (veegpt-hybrid), which is cheap.
  if (!aiModel) return 'cheap';
  return MODEL_TIER[aiModel] ?? UNKNOWN_MODEL_TIER;
}

/** True when `tier` is at or below `max`. */
export function tierWithin(tier: ModelTier, max: ModelTier): boolean {
  return TIER_ORDER[tier] <= TIER_ORDER[max];
}

/** All models belonging to a tier (used by the Auto router and admin tools). */
export function modelsInTier(tier: ModelTier): string[] {
  return Object.keys(MODEL_TIER).filter(id => MODEL_TIER[id] === tier);
}

/**
 * How each plan may use each tier — the authoritative ACCESS matrix (spec §15).
 *
 *   full    — usable within the ordinary VGU budget, no tier-specific cap
 *   limited — usable until a tier-specific allowance is spent
 *   none    — not available at all (the only case the UI shows as locked)
 *
 * `maxRequests` is a request COUNT, used where the spec defines one (Free's 5
 * premium previews). VGU sub-budgets for paid plans are layered on top of this
 * in server/config/veegpt-vgu.config.ts, which imports this matrix rather than
 * restating it — one source, readable by both server and client.
 */
export type TierAccessKind = 'full' | 'limited' | 'none';

export interface TierAccess {
  access: TierAccessKind;
  /** Requests of this tier allowed per billing period, when capped by count. */
  maxRequests?: number;
}

export const PLAN_TIER_ACCESS: Record<string, Record<ModelTier, TierAccess>> = {
  free: {
    cheap: { access: 'full' },
    // Spec §15: Free gets *limited* Medium — not zero.
    medium: { access: 'limited', maxRequests: 30 },
    // Spec §16: exactly 5 Premium previews per billing period.
    premium: { access: 'limited', maxRequests: 5 },
    ultra: { access: 'none' },
  },
  creator: {
    cheap: { access: 'full' },
    medium: { access: 'full' },
    premium: { access: 'limited' },
    ultra: { access: 'none' },
  },
  pro: {
    cheap: { access: 'full' },
    medium: { access: 'full' },
    premium: { access: 'limited' },
    ultra: { access: 'limited' },
  },
  business: {
    cheap: { access: 'full' },
    medium: { access: 'full' },
    premium: { access: 'limited' },
    ultra: { access: 'limited' },
  },
  enterprise: {
    cheap: { access: 'full' },
    medium: { access: 'full' },
    premium: { access: 'full' },
    ultra: { access: 'full' },
  },
};

/** Access kind for a plan/tier pair, defaulting to the most restrictive. */
export function tierAccessFor(plan: string, tier: ModelTier): TierAccess {
  return PLAN_TIER_ACCESS[plan]?.[tier] ?? { access: 'none' };
}

/** A tier the user may choose at all (locked only when access is 'none'). */
export function isTierSelectable(plan: string, tier: ModelTier): boolean {
  return tierAccessFor(plan, tier).access !== 'none';
}

/**
 * Highest tier the plan may use WITHOUT spending a limited allowance — the tier
 * a reply falls back to, and the one shown as "your model" in copy.
 */
export function baseTierFor(plan: string): ModelTier {
  let base: ModelTier = 'cheap';
  for (const tier of ['cheap', 'medium', 'premium', 'ultra'] as ModelTier[]) {
    if (tierAccessFor(plan, tier).access === 'full') base = tier;
  }
  return base;
}

/** The plan that unlocks a tier as a regular (non-allowance) choice. */
export const TIER_MIN_PLAN_LABEL: Record<ModelTier, string> = {
  cheap: 'Free',
  medium: 'Creator',
  premium: 'Pro',
  ultra: 'Enterprise',
};

/** The user-visible model id used when the router picks a tier itself (AUTO). */
export const TIER_DEFAULT_MODEL: Record<ModelTier, string> = {
  cheap: 'veegpt-hybrid',
  medium: 'gemini-flash-latest',
  premium: 'openai-gpt-4.1',
  // AUTO only reaches ultra for the hardest tasks on plans that allow it; it
  // routes to a real ultra model rather than borrowing a premium one.
  ultra: 'openai-gpt-5.6-sol',
};

/** Sentinel stored in AI Configuration when the user delegates model choice. */
export const AUTO_MODEL_ID = 'veegpt-auto';
