/**
 * VGU configuration — the single authoritative source for VeeGPT usage policy.
 *
 * VGU (VeeGPT Usage Unit) is an internal normalized measure of AI resource
 * consumption. It is NOT money and NOT a message count:
 *
 *   1 VGU ≈ one lightweight request on a cheap model.
 *
 * Three economic concepts stay strictly separate (spec §3):
 *   • provider cost — real money paid to OpenAI/Google/Tavily (USD, versioned
 *     pricing in veegpt-pricing.registry.ts)
 *   • VGU           — internal normalized usage, what quotas are denominated in
 *   • credits       — the commercial top-up currency users can buy
 *
 * Nothing in this file hard-codes "1 VGU = ₹X". The anchor below is a
 * configurable reference point, and every quota number is overridable via env so
 * production can be retuned without a deploy.
 *
 * NO CONTROLLER MAY HARD-CODE A QUOTA. Read it from here.
 */

import type { PlanId } from './plan-config';
import {
  MODEL_TIER,
  TIER_MULTIPLIER,
  modelTierOf,
  tierAccessFor,
  baseTierFor,
  type ModelTier,
} from '@shared/veegpt-model-tiers';
import type { AIFeature } from '../services/aiUsageTracker';

export {
  MODEL_TIER,
  TIER_MULTIPLIER,
  modelTierOf,
  tierAccessFor,
  baseTierFor,
  type ModelTier,
};

/** -1 in config means unlimited; surfaced as Infinity at runtime. */
export const UNLIMITED = Number.POSITIVE_INFINITY;

// ---------------------------------------------------------------------------
// The VGU anchor
// ---------------------------------------------------------------------------

/**
 * The provider cost (USD) that equals exactly 1 VGU.
 *
 * Derived from a measured reference request: ~4,400 input + ~700 output tokens
 * on gpt-4o-mini ($0.15 / $0.60 per 1M) = $0.00108. Those token counts are the
 * real production median for a VeeGPT chat turn (prompt ~17.6k chars).
 *
 * Because actual VGU is `providerCost / anchor`, this single number defines the
 * exchange rate between real money and internal units. It is deliberately
 * separate from the tier multipliers so provider price changes do not silently
 * re-price every plan: raising the anchor makes everything cost fewer VGU.
 */
export const VGU_ANCHOR_USD = envFloat('VEEGPT_VGU_ANCHOR_USD', 0.0011);

/** The reference request the anchor was derived from (documentation + tests). */
export const VGU_REFERENCE_REQUEST = {
  model: 'gpt-4o-mini',
  inputTokens: 4400,
  outputTokens: 700,
} as const;

/** No billable AI request may ever cost 0 VGU — nothing is free. */
export const MIN_VGU_PER_REQUEST = envFloat('VEEGPT_MIN_VGU', 1);

/** VGU is tracked to this many decimals; quotas compare rounded values. */
export const VGU_DECIMALS = 2;

/** Round a VGU amount to the tracked precision. */
export function roundVGU(v: number): number {
  const f = 10 ** VGU_DECIMALS;
  return Math.round((v + Number.EPSILON) * f) / f;
}

// ---------------------------------------------------------------------------
// Per-tier allocations
// ---------------------------------------------------------------------------

/**
 * How a plan may use a model tier.
 *  full    — usable within the ordinary VGU budget, no tier-specific cap
 *  limited — usable until a tier-specific allowance is spent
 *  none    — not available at all
 *
 * `maxRequests` is a COUNT (used for Free's 5 premium previews, spec §16).
 * `maxVGU` is a VGU sub-budget (used for paid plans, spec §17) so a user cannot
 * spend their whole monthly allowance on the most expensive model.
 * A tier may set both; whichever binds first stops further use of that tier.
 */
export interface TierAllocation {
  access: 'full' | 'limited' | 'none';
  maxRequests?: number;
  maxVGU?: number;
}

/**
 * VGU sub-budgets layered on top of the shared ACCESS matrix. The access kind
 * and any request-count allowance come from shared/veegpt-model-tiers.ts; only
 * the VGU ceilings live here (the client has no need for them, and they are
 * env-overridable).
 *
 * Spec §17/§18: a user must not be able to spend their entire monthly allowance
 * on the most expensive model, and ultra must be tighter than premium.
 */
const TIER_VGU_BUDGET: Record<PlanId, Partial<Record<ModelTier, number>>> = {
  free: {},
  // ~33% of Creator's 3,000 monthly VGU.
  creator: { premium: 1000 },
  // These are SUB-CAPS inside the plan's monthly pool, not additions to it: the
  // monthly total (Pro 12,000 / Business 30,000) is unchanged by these; they only
  // govern how much of that pool may go to premium vs ultra. Each plan keeps ample
  // headroom for cheap/medium after both are maxed (Pro 12,000 − 6,000 − 2,500 =
  // 3,500; Business 40,000 − 15,000 − 4,000 = 21,000).
  //
  // Early-stage GENEROUS allowance while the user base is small and we can absorb
  // some loss: Pro ultra 2,500 VGU ≈ 60+ gpt-5.6-sol turns/month, premium 6,000 ≈
  // 400 premium turns. Retune down via env (VEEGPT_TIER_VGU_<PLAN>_<TIER>) once
  // real usage and unit economics are known.
  pro: { premium: 6000, ultra: 2500 },
  business: { premium: 15000, ultra: 4000 },
  enterprise: {},
};

/**
 * Per-tier ROLLING 5-HOUR sub-cap, in VGU. A model tier listed here may consume
 * at most this much of the plan's 5-hour burst window; the plan's overall 5-hour
 * burst still applies on top.
 *
 * Purpose (spec §5, burst protection): the monthly ultra allowance should not be
 * spendable in a single sitting. Ultra is capped at HALF the plan's 5-hour burst,
 * so a Pro user (800 burst) can spend at most 400 VGU of ultra per 5 hours
 * (~10 gpt-5.6-sol turns) and a Business user (2,000 burst) at most 1,000. A tier
 * absent here has no 5-hour sub-cap (only the overall burst binds it).
 *
 * Env override: VEEGPT_TIER_5H_<PLAN>_<TIER> (e.g. VEEGPT_TIER_5H_PRO_ULTRA).
 */
const TIER_5H_VGU_BUDGET: Record<PlanId, Partial<Record<ModelTier, number>>> = {
  free: {},
  creator: {},
  pro: { ultra: 400 }, // half of Pro's 800 5-hour burst
  business: { ultra: 1000 }, // half of Business's 2,000 5-hour burst
  enterprise: {},
};

/**
 * The rolling 5-hour VGU sub-cap for a tier on a plan, or -1 when the tier has no
 * 5-hour sub-cap (only the overall burst applies). Env-overridable.
 */
export function tierFiveHourCap(plan: PlanId, tier: ModelTier): number {
  const P = plan.toUpperCase();
  const T = tier.toUpperCase();
  const base = TIER_5H_VGU_BUDGET[plan]?.[tier];
  const env = process.env[`VEEGPT_TIER_5H_${P}_${T}`];
  if (env !== undefined) return envCap(`VEEGPT_TIER_5H_${P}_${T}`, base ?? -1);
  return base ?? -1;
}

export interface PlanVGUPolicy {
  /** Rolling 5-hour burst budget, in VGU. -1 = unlimited. */
  fiveHourVGU: number;
  /** Billing-period budget, in VGU. -1 = unlimited. */
  monthlyVGU: number;
  /** Request-rate cap (separate from VGU — spec §31). */
  requestsPerMinute: number;
  /** Simultaneous in-flight AI operations allowed, per user. */
  maxConcurrentAI: number;
  /**
   * Simultaneous in-flight AI operations allowed for the whole WORKSPACE
   * (spec §39).
   *
   * -1 here (surfaced as UNLIMITED by policyForPlan) means "no workspace bound",
   * which is correct for single-seat plans: the per-user limit already IS the
   * workspace limit, and applying the same number twice would only make the
   * limit look like it had moved.
   *
   * A pooled team MUST set it, because N seats × the per-seat limit is not a
   * workspace bound: 10 Business seats at 10 each is 100 simultaneous provider
   * calls, not the 10 the spec allows.
   */
  maxConcurrentWorkspace: number;
  /**
   * True when the monthly budget is shared across the workspace (Business).
   * A pooled plan enforces BOTH the workspace pool and a per-seat share.
   */
  pooled: boolean;
  /** Fraction of the pool a single seat may consume (spec §38: 40%). */
  seatSharePct: number;
}

/**
 * EARLY-STAGE GENEROUS LIMITS (spec §4, §15, §31, §38).
 *
 * These budgets were raised ~2.5× above the original message-cap-equivalent
 * numbers (Free 100 / Creator 1,200 / Pro 5,000 / Business 12,000 monthly) to
 * Free 300 / Creator 3,000 / Pro 12,000 / Business 40,000 while
 * the user base is small and we can deliberately absorb some loss to keep the
 * product feeling unrestricted. Because one cheap turn is ~1 VGU, a user on the
 * default model never notices a limit; the budget only bites on expensive models
 * and expensive features. Every value is env-overridable (VEEGPT_MONTHLY_VGU_*,
 * VEEGPT_5H_VGU_*) so limits can be tightened in production without a deploy once
 * real usage and unit economics are known.
 */
export const PLAN_VGU_POLICY: Record<PlanId, PlanVGUPolicy> = {
  free: {
    fiveHourVGU: 40,
    monthlyVGU: 300,
    requestsPerMinute: 10,
    maxConcurrentAI: 1,
    // Single-seat plan: the per-user limit already bounds the workspace.
    maxConcurrentWorkspace: -1,
    pooled: false,
    seatSharePct: 100,
  },
  creator: {
    fiveHourVGU: 300,
    monthlyVGU: 3000,
    requestsPerMinute: 20,
    maxConcurrentAI: 2,
    maxConcurrentWorkspace: -1,
    pooled: false,
    seatSharePct: 100,
  },
  pro: {
    fiveHourVGU: 800,
    monthlyVGU: 12000,
    requestsPerMinute: 40,
    maxConcurrentAI: 4,
    maxConcurrentWorkspace: -1,
    pooled: false,
    seatSharePct: 100,
  },
  business: {
    fiveHourVGU: 2000,
    // 40,000 pool so a single seat's 40% share (16,000) is clearly ABOVE Pro's
    // 12,000 monthly — otherwise the two plans showed an identical "Monthly VGU"
    // on the usage panel (Business's per-seat share == Pro's whole budget).
    monthlyVGU: 40000,
    requestsPerMinute: 80,
    maxConcurrentAI: 10,
    // Spec §39: 10 simultaneous AI operations per WORKSPACE, not per seat.
    maxConcurrentWorkspace: 10,
    pooled: true,
    // Spec §38: one seat may not exceed 40% of the shared pool (16,000 of 40,000).
    seatSharePct: 40,
  },
  enterprise: {
    fiveHourVGU: -1,
    monthlyVGU: -1,
    requestsPerMinute: 200,
    maxConcurrentAI: 25,
    maxConcurrentWorkspace: 50,
    pooled: true,
    seatSharePct: 100,
  },
};

// ---------------------------------------------------------------------------
// Feature registry
// ---------------------------------------------------------------------------

/**
 * Classification used by the coverage audit (spec: classify every AI path).
 *  user-facing — a user action directly triggers it; must be quota-enforced
 *  background  — a worker/schedule triggers it; must be quota-enforced too
 *  internal    — small housekeeping AI (titles, intent parsing); metered but
 *                never blocks the user's actual request
 */
export type FeatureKind = 'user-facing' | 'background' | 'internal';

export interface FeatureSpec {
  label: string;
  kind: FeatureKind;
  /**
   * Pre-flight base estimate in VGU, BEFORE the model-tier multiplier. This is
   * only an estimate; the charge is reconciled from real tokens afterwards.
   */
  baseVGU: number;
  /** Extra multiplier for tool/fan-out overhead not visible in token counts. */
  toolMultiplier: number;
  /** Hard ceiling for a single request — the runaway stop. */
  maxVGUPerRequest: number;
  /** Per-plan billing-period VGU cap for this feature (high-risk features). */
  monthlyCapByPlan?: Partial<Record<PlanId, number>>;
  /**
   * Per-plan billing-period REQUEST-COUNT cap for this feature. Distinct from the
   * VGU cap: this bounds HOW MANY times the feature may run, independent of how
   * cheap each run is. Used for count-based previews (e.g. Free = 1 deep research,
   * Creator = 2) where a VGU cap alone would let many low-cost runs slip through.
   * A plan absent from the map is uncapped on count (only VGU/pool bound it).
   */
  monthlyRequestsByPlan?: Partial<Record<PlanId, number>>;
  /** Max simultaneous executions of this feature per user. */
  concurrency?: number;
  /** Max provider calls one request may make (fan-out guard). */
  maxProviderCalls?: number;
  /** Wall-clock budget for one request. */
  timeoutMs?: number;
  /** Max retries permitted for this feature. */
  maxRetries?: number;
  /**
   * When false, exhausted quota does NOT block this feature — it is recorded and
   * allowed. Reserved for tiny internal housekeeping calls whose failure would
   * corrupt the product (e.g. persisting memory) and whose cost is negligible.
   */
  blocking?: boolean;
}

const DEFAULT_FEATURE: FeatureSpec = {
  label: 'AI request',
  kind: 'user-facing',
  baseVGU: 1,
  toolMultiplier: 1,
  maxVGUPerRequest: 50,
  // Spec §37: retries must be BOUNDED. A default of 1 means a transient 429 or
  // 503 gets one more attempt — enough to ride out a provider blip — while an
  // unset value can never be read as "unlimited". `withProviderRetry` treats this
  // as a ceiling a caller may lower but never raise.
  maxRetries: 1,
  blocking: true,
};

/**
 * Every AI feature, keyed by the SAME `AIFeature` labels the usage tracker
 * already uses — deliberately one taxonomy, not two.
 */
export const FEATURE_REGISTRY: Partial<Record<AIFeature, FeatureSpec>> = {
  // ── VeeGPT chat ─────────────────────────────────────────────────────────
  'veegpt.chat': {
    label: 'VeeGPT chat',
    kind: 'user-facing',
    baseVGU: 1,
    toolMultiplier: 1,
    // The per-request ceiling is a SANITY backstop, not the real per-turn budget
    // — the 5-hour BURST budget is (Free 40 / Creator 300 / Pro 800 / Business
    // 2,000 VGU). It is set to the largest plan's burst so a turn is CHARGED its
    // real provider cost up to that budget, and a turn that would exceed it is
    // refused pre-flight by the burst gate rather than run and be under-charged.
    //
    // It used to be 120, which silently clipped large-context turns on expensive
    // models: a 160k-char gpt-5.6-sol turn costs ~$0.32 (≈291 VGU) but was charged
    // only 120 — Veefore absorbed the rest. At 2,000 the real cost is charged (and
    // still bounded by each plan's burst), closing that leak.
    maxVGUPerRequest: 2000,
    // A chat turn streams, so a retry re-runs a partially-delivered reply. One
    // attempt to ride out a 429 is worth it; more is not.
    maxRetries: 1,
    timeoutMs: 5 * 60 * 1000,
    // A single turn may fan out across tool calls, but not without limit.
    maxProviderCalls: 30,
    blocking: true,
  },
  'veegpt.media_analysis': {
    label: 'Image / video analysis',
    kind: 'user-facing',
    baseVGU: 3,
    toolMultiplier: 1,
    // Same reasoning as veegpt.chat: a large image/video analysis on a premium or
    // ultra model must be charged its real cost, bounded by the plan burst, not
    // clipped at a low flat ceiling that the business would then absorb.
    maxVGUPerRequest: 2000,
    maxRetries: 1,
    timeoutMs: 3 * 60 * 1000,
    maxProviderCalls: 8,
    blocking: true,
  },
  'veegpt.post_agent': {
    label: 'Post agent',
    kind: 'user-facing',
    baseVGU: 2,
    toolMultiplier: 1,
    maxVGUPerRequest: 40,
    blocking: true,
  },
  'veegpt.post_caption': {
    label: 'Caption (post agent)',
    kind: 'user-facing',
    baseVGU: 1,
    toolMultiplier: 1,
    maxVGUPerRequest: 20,
    blocking: true,
  },
  'veegpt.post_hashtags': {
    label: 'Hashtags (post agent)',
    kind: 'user-facing',
    baseVGU: 1,
    toolMultiplier: 1,
    maxVGUPerRequest: 20,
    blocking: true,
  },

  // ── Internal housekeeping: metered, never blocks ────────────────────────
  'veegpt.title': { ...DEFAULT_FEATURE, label: 'Conversation title', kind: 'internal', baseVGU: 0.2, maxVGUPerRequest: 5, blocking: false },
  'veegpt.memory_detect': { ...DEFAULT_FEATURE, label: 'Memory detection', kind: 'internal', baseVGU: 0.2, maxVGUPerRequest: 5, blocking: false },
  'veegpt.memory_summary': { ...DEFAULT_FEATURE, label: 'Memory summary', kind: 'internal', baseVGU: 0.5, maxVGUPerRequest: 10, blocking: false },
  'veegpt.memory_update': { ...DEFAULT_FEATURE, label: 'Memory update', kind: 'internal', baseVGU: 0.3, maxVGUPerRequest: 8, blocking: false },
  'veegpt.parse_intent': { ...DEFAULT_FEATURE, label: 'Intent parse', kind: 'internal', baseVGU: 0.2, maxVGUPerRequest: 5, blocking: false },

  // ── Research / web (high fan-out) ───────────────────────────────────────
  'trend.intelligence': {
    label: 'Trend research',
    kind: 'user-facing',
    baseVGU: 4,
    toolMultiplier: 1,
    maxVGUPerRequest: 60,
    concurrency: 2,
    maxProviderCalls: 8,
    timeoutMs: 120_000,
    maxRetries: 1,
    blocking: true,
  },
  'competitor.analysis': {
    label: 'Competitor analysis',
    kind: 'user-facing',
    baseVGU: 4,
    toolMultiplier: 1,
    maxVGUPerRequest: 60,
    concurrency: 2,
    maxProviderCalls: 8,
    timeoutMs: 120_000,
    maxRetries: 1,
    blocking: true,
  },

  // ── Content features ────────────────────────────────────────────────────
  'caption.generation': { ...DEFAULT_FEATURE, label: 'Caption generation', baseVGU: 1, maxVGUPerRequest: 20 },
  'caption.regenerate': { ...DEFAULT_FEATURE, label: 'Caption regenerate', baseVGU: 1, maxVGUPerRequest: 20 },
  'hashtag.generation': { ...DEFAULT_FEATURE, label: 'Hashtag generation', baseVGU: 1, maxVGUPerRequest: 15 },
  'content.brief': { ...DEFAULT_FEATURE, label: 'Creative brief', baseVGU: 2, maxVGUPerRequest: 40 },
  'content.repurpose': { ...DEFAULT_FEATURE, label: 'Content repurpose', baseVGU: 2, maxVGUPerRequest: 40 },
  'growth.recommendations': { ...DEFAULT_FEATURE, label: 'Growth recommendations', baseVGU: 2, maxVGUPerRequest: 40 },
  'growth.insight': { ...DEFAULT_FEATURE, label: 'Performance insight', baseVGU: 1, maxVGUPerRequest: 20 },
  'video.script': { ...DEFAULT_FEATURE, label: 'Video script', baseVGU: 3, maxVGUPerRequest: 60 },
  'thumbnail.generation': { ...DEFAULT_FEATURE, label: 'Thumbnail strategy', baseVGU: 2, maxVGUPerRequest: 40 },

  // ── Generation features priced by unit, not tokens ───────────────────────
  // An image is a fixed provider charge (DALL·E standard ≈ $0.04), so its VGU is
  // set from that cost rather than from token counts.
  'image.generation': {
    label: 'Image generation',
    kind: 'user-facing',
    baseVGU: 36,
    toolMultiplier: 1,
    maxVGUPerRequest: 120,
    concurrency: 2,
    // An image is a fixed ~$0.04 charge, so a retry is expensive in absolute
    // terms. One attempt, and a tight call ceiling.
    maxRetries: 1,
    maxProviderCalls: 4,
    timeoutMs: 2 * 60 * 1000,
    blocking: true,
  },
  'video.generation': {
    label: 'Video generation',
    kind: 'user-facing',
    baseVGU: 40,
    toolMultiplier: 1,
    maxVGUPerRequest: 400,
    concurrency: 1,
    timeoutMs: 600_000,
    maxRetries: 1,
    // The highest-fan-out feature in the product: a script call, a voiceover
    // optimisation, an image per scene (up to 8), plus scene regenerations. 25
    // covers a full pipeline with headroom while still bounding a loop that
    // regenerates scenes indefinitely — which the 400 VGU ceiling alone does not,
    // because it caps the CHARGE, not the number of calls.
    maxProviderCalls: 25,
    blocking: true,
  },

  // ── Background workers ──────────────────────────────────────────────────
  'social_listening.extract': {
    label: 'Social listening extraction',
    kind: 'background',
    baseVGU: 1,
    toolMultiplier: 1,
    maxVGUPerRequest: 30,
    // Background work can wait, so a second attempt is cheap insurance. It runs
    // per post, so the call ceiling must stay tight.
    maxRetries: 2,
    maxProviderCalls: 3,
    timeoutMs: 90_000,
    blocking: true,
  },
  'social_listening.batch_submitted': { ...DEFAULT_FEATURE, label: 'Social listening batch submit', kind: 'background', baseVGU: 1, maxVGUPerRequest: 40 },
  'social_listening.batch_finalized': { ...DEFAULT_FEATURE, label: 'Social listening batch finalize', kind: 'background', baseVGU: 1, maxVGUPerRequest: 40 },

  other: { ...DEFAULT_FEATURE, label: 'Other AI' },
};

/**
 * Features that are not part of the `AIFeature` union yet but need governance.
 * Deep research and Autopilot are the two highest-risk cost sources in the
 * product, so their ceilings live here explicitly rather than defaulting.
 */
export const DEEP_RESEARCH_FEATURE = 'veegpt.deep_research' as const;
export const AUTOPILOT_FEATURE = 'veegpt.autopilot' as const;

/**
 * The anonymous landing-page caption demo. It has no user to charge, so instead
 * of a per-user quota it gets a GLOBAL feature ceiling: the whole endpoint shares
 * one monthly VGU budget across every visitor. Without it, "10 requests per
 * minute per IP" bounds nothing — a botnet is unlimited IPs.
 */
export const LANDING_DEMO_FEATURE = 'landing.demo_caption' as const;

/** AI intent classification for comment-automation rules (webhook-driven). */
export const AUTOMATION_INTENT_FEATURE = 'automation.intent' as const;

/** Synthetic quota owner for anonymous public AI, so it lands in one budget. */
export const PUBLIC_DEMO_USER_ID = '__public_landing_demo';

export const EXTENDED_FEATURE_REGISTRY: Record<string, FeatureSpec> = {
  [DEEP_RESEARCH_FEATURE]: {
    label: 'Deep research',
    kind: 'user-facing',
    // Initial ESTIMATE only. One observed job made 12 model calls plus a paid
    // Tavily deep-research request over ~5 minutes; the actual charge is
    // reconciled from real usage and can exceed this.
    baseVGU: 40,
    toolMultiplier: 1,
    // Hard ceiling: a single job can never bill more than this, whatever the
    // provider does. This is the difference between a bounded feature and an
    // uncontrolled provider bill.
    //
    // Deep research is the single most expensive thing VeeGPT does (many model
    // calls + paid search per job), so this ceiling is deliberately LOW to bound
    // one job to ~$0.88 of provider spend even in a worst-case fan-out. That also
    // makes the Free/Creator PREVIEW safe: one preview can't blow a large hole in
    // the plan's tiny pool. The monthly cap below bounds how MANY jobs run.
    maxVGUPerRequest: 800,
    // Per-plan monthly VGU for deep research (a sub-cap inside the plan pool).
    // Pro/Business get a working allowance; Free/Creator's VGU here is generous
    // because the real limit for them is the COUNT cap below.
    monthlyCapByPlan: {
      free: 1600,       // headroom for 1 job even at the ceiling
      creator: 3200,    // headroom for 2 jobs
      pro: 3000,        // reduced from 5000 — deep research is costly
      business: 6000,   // reduced from 12000
      enterprise: -1,
    },
    // COUNT-based preview: this is what actually guarantees "Free = 1, Creator = 2"
    // no matter how cheap each run is. Pro/Business/Enterprise are uncapped on
    // count (bounded by the VGU cap above and the plan pool instead).
    monthlyRequestsByPlan: {
      free: 1,
      creator: 2,
    },
    concurrency: 1,
    maxProviderCalls: 25,
    timeoutMs: 8 * 60 * 1000,
    maxRetries: 1,
    blocking: true,
  },
  [AUTOMATION_INTENT_FEATURE]: {
    label: 'Automation intent match',
    kind: 'background',
    // A tiny classifier call, but it fires on EVERY incoming comment webhook, so
    // volume — not size — is the cost risk. Capping it per period means a viral
    // post cannot turn comment automation into an open-ended bill.
    baseVGU: 0.2,
    toolMultiplier: 1,
    maxVGUPerRequest: 3,
    monthlyCapByPlan: { free: 20, creator: 200, pro: 1000, business: 3000, enterprise: -1 },
    maxProviderCalls: 1,
    timeoutMs: 20_000,
    maxRetries: 0,
    // Blocking: when the allowance is spent the automation falls back to keyword
    // matching, which still works. Silently continuing to pay would not.
    blocking: true,
  },
  [LANDING_DEMO_FEATURE]: {
    label: 'Landing demo captions',
    kind: 'user-facing',
    baseVGU: 1,
    toolMultiplier: 1,
    // One demo request is three short captions; anything larger is a bug.
    maxVGUPerRequest: 5,
    // Enforced against the synthetic public user, whose plan is `enterprise`
    // (no per-user budget) precisely so THIS is the only binding limit.
    // Override with VEEGPT_FEATURE_CAP_LANDING_DEMO_CAPTION.
    monthlyCapByPlan: { enterprise: 3000 },
    // Bounds a burst of concurrent visitors independently of the per-IP limiter.
    concurrency: 8,
    maxProviderCalls: 2,
    timeoutMs: 30_000,
    maxRetries: 0,
    blocking: true,
  },
  [AUTOPILOT_FEATURE]: {
    label: 'Autopilot',
    kind: 'background',
    baseVGU: 20,
    toolMultiplier: 1,
    // As with deep research: an autopilot iteration can fan out to many calls on
    // an expensive model, so the per-job ceiling must be high enough to charge
    // the real cost (was 400). The monthly autopilot cap bounds frequency.
    maxVGUPerRequest: 2500,
    monthlyCapByPlan: { pro: 5000, business: 15000, enterprise: -1 },
    concurrency: 1,
    maxProviderCalls: 40,
    timeoutMs: 15 * 60 * 1000,
    maxRetries: 1,
    blocking: true,
  },
};

/**
 * Maximum provider calls one request of this feature may make (spec §37), or 0
 * for unbounded.
 *
 * Overridable with `VEEGPT_FEATURE_CALLS_<FEATURE>` (dots and dashes become
 * underscores, upper-cased), because a fan-out ceiling is exactly the kind of
 * number that needs tightening the moment a runaway appears in production — and
 * loosening if a legitimate job turns out to need more room. Negative means
 * unbounded.
 */
export function featureProviderCallLimit(feature: string): number {
  const envName = `VEEGPT_FEATURE_CALLS_${feature.replace(/[.\-]/g, '_').toUpperCase()}`;
  const raw = process.env[envName];
  if (raw !== undefined) {
    const n = Number(raw);
    if (Number.isFinite(n)) return n < 0 ? 0 : Math.floor(n);
  }
  return featureSpec(feature).maxProviderCalls ?? 0;
}

/**
 * How many runs of this feature one user may have in flight, or 0 for no limit.
 *
 * Overridable with `VEEGPT_FEATURE_CONCURRENCY_<FEATURE>`, so a large customer can
 * be allowed two concurrent research jobs — or a misbehaving feature pinned to one
 * — without a deploy. Negative or 0 means unbounded.
 */
export function featureConcurrencyLimit(feature: string): number {
  const envName = `VEEGPT_FEATURE_CONCURRENCY_${feature.replace(/[.\-]/g, '_').toUpperCase()}`;
  const raw = process.env[envName];
  if (raw !== undefined) {
    const n = Number(raw);
    if (Number.isFinite(n)) return n <= 0 ? 0 : Math.floor(n);
  }
  return featureSpec(feature).concurrency ?? 0;
}

/**
 * Wall-clock budget for one request of this feature, or 0 for no budget.
 *
 * Overridable with `VEEGPT_FEATURE_TIMEOUT_<FEATURE>` in milliseconds, for the
 * same reason as the call ceiling: when a feature starts hanging in production you
 * need to bound it now, not next deploy. Negative or 0 means no budget.
 */
export function featureTimeoutMs(feature: string): number {
  const envName = `VEEGPT_FEATURE_TIMEOUT_${feature.replace(/[.\-]/g, '_').toUpperCase()}`;
  const raw = process.env[envName];
  if (raw !== undefined) {
    const n = Number(raw);
    if (Number.isFinite(n)) return n <= 0 ? 0 : Math.floor(n);
  }
  return featureSpec(feature).timeoutMs ?? 0;
}

/** Resolve a feature's governance spec. Unknown features get safe defaults. */
export function featureSpec(feature: string): FeatureSpec {
  return (
    EXTENDED_FEATURE_REGISTRY[feature] ??
    (FEATURE_REGISTRY as Record<string, FeatureSpec>)[feature] ??
    DEFAULT_FEATURE
  );
}

/**
 * Monthly VGU cap for a feature on a plan, or Infinity when uncapped.
 *
 * Overridable per feature so a runaway cost can be clamped in production without
 * a deploy: `VEEGPT_FEATURE_CAP_<FEATURE>` (dots and dashes become underscores,
 * upper-cased), optionally narrowed by plan with
 * `VEEGPT_FEATURE_CAP_<FEATURE>_<PLAN>`. Negative means unlimited.
 */
export function featureMonthlyCap(feature: string, plan: PlanId): number {
  const spec = featureSpec(feature);
  const envName = `VEEGPT_FEATURE_CAP_${feature.replace(/[.\-]/g, '_').toUpperCase()}`;
  const perPlan = process.env[`${envName}_${plan.toUpperCase()}`];
  const global = process.env[envName];
  for (const raw of [perPlan, global]) {
    if (raw === undefined) continue;
    const n = Number(raw);
    if (Number.isFinite(n)) return n < 0 ? UNLIMITED : n;
  }
  const raw = spec.monthlyCapByPlan?.[plan];
  if (raw === undefined) return UNLIMITED;
  return raw < 0 ? UNLIMITED : raw;
}

/**
 * Monthly REQUEST-COUNT cap for a feature on a plan, or Infinity when uncapped.
 *
 * This is the count-based sibling of `featureMonthlyCap`: it bounds how many
 * times a feature may run in a period regardless of each run's VGU. It exists so
 * a preview like "Free gets 1 deep research, Creator gets 2" holds even when a
 * job happens to be cheap — a VGU cap alone would let extra low-cost runs pass.
 *
 * Overridable per feature/plan via
 * `VEEGPT_FEATURE_REQCAP_<FEATURE>[_<PLAN>]` (negative = unlimited).
 */
export function featureMonthlyRequestCap(feature: string, plan: PlanId): number {
  const spec = featureSpec(feature);
  const envName = `VEEGPT_FEATURE_REQCAP_${feature.replace(/[.\-]/g, '_').toUpperCase()}`;
  const perPlan = process.env[`${envName}_${plan.toUpperCase()}`];
  const global = process.env[envName];
  for (const raw of [perPlan, global]) {
    if (raw === undefined) continue;
    const n = Number(raw);
    if (Number.isFinite(n)) return n < 0 ? UNLIMITED : n;
  }
  const raw = spec.monthlyRequestsByPlan?.[plan];
  if (raw === undefined) return UNLIMITED;
  return raw < 0 ? UNLIMITED : raw;
}

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------

/** Rolling burst window length in seconds (spec §12: a TRUE rolling window). */
export function burstWindowSec(): number {
  const raw = Number(process.env.VEEGPT_SESSION_WINDOW_HOURS);
  const hours = Number.isFinite(raw) && raw > 0 ? raw : 5;
  return Math.floor(hours * 3600);
}

/** How long a reservation may stay open before it is reclaimed (spec §10). */
export function reservationTtlSec(): number {
  const raw = Number(process.env.VEEGPT_RESERVATION_TTL_SEC);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 15 * 60;
}

// ---------------------------------------------------------------------------
// Resolved policy (with env overrides)
// ---------------------------------------------------------------------------

export interface ResolvedPolicy extends PlanVGUPolicy {
  plan: PlanId;
}

function envFloat(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Read a numeric override; negative means unlimited. */
function envCap(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw !== undefined) {
    const n = Number(raw);
    if (Number.isFinite(n)) return n < 0 ? UNLIMITED : n;
  }
  return fallback < 0 ? UNLIMITED : fallback;
}

/**
 * The effective policy for a plan. Every quota is env-overridable so limits can
 * be retuned in production without a deploy:
 *   VEEGPT_5H_VGU_<PLAN>, VEEGPT_MONTHLY_VGU_<PLAN>,
 *   VEEGPT_RPM_<PLAN>, VEEGPT_CONCURRENCY_<PLAN>, VEEGPT_SEAT_SHARE_<PLAN>
 */
export function policyForPlan(plan: PlanId): ResolvedPolicy {
  const base = PLAN_VGU_POLICY[plan] ?? PLAN_VGU_POLICY.free;
  const P = plan.toUpperCase();
  return {
    ...base,
    plan,
    fiveHourVGU: envCap(`VEEGPT_5H_VGU_${P}`, base.fiveHourVGU),
    monthlyVGU: envCap(`VEEGPT_MONTHLY_VGU_${P}`, base.monthlyVGU),
    requestsPerMinute: envCap(`VEEGPT_RPM_${P}`, base.requestsPerMinute),
    maxConcurrentAI: envCap(`VEEGPT_CONCURRENCY_${P}`, base.maxConcurrentAI),
    maxConcurrentWorkspace: envCap(
      `VEEGPT_WS_CONCURRENCY_${P}`,
      base.maxConcurrentWorkspace
    ),
    seatSharePct: envCap(`VEEGPT_SEAT_SHARE_${P}`, base.seatSharePct),
  };
}

/** Per-seat monthly ceiling for a pooled plan (Infinity when not pooled). */
export function seatMonthlyCap(policy: ResolvedPolicy): number {
  if (!policy.pooled) return policy.monthlyVGU;
  if (policy.monthlyVGU === UNLIMITED) return UNLIMITED;
  const pct = Math.max(1, Math.min(100, policy.seatSharePct));
  return Math.max(1, Math.floor((policy.monthlyVGU * pct) / 100));
}

/**
 * The full allocation governing a tier on a plan: the shared access matrix plus
 * this plan's VGU sub-budget for that tier.
 *
 * Env overrides: VEEGPT_TIER_VGU_<PLAN>_<TIER> (e.g. VEEGPT_TIER_VGU_PRO_PREMIUM),
 * and VEEGPT_TIER_REQUESTS_<PLAN>_<TIER> for count-based allowances.
 */
export function tierAllocation(plan: PlanId, tier: ModelTier): TierAllocation {
  const access = tierAccessFor(plan, tier);
  const P = plan.toUpperCase();
  const T = tier.toUpperCase();

  const maxVGURaw = TIER_VGU_BUDGET[plan]?.[tier];
  const maxVGU =
    process.env[`VEEGPT_TIER_VGU_${P}_${T}`] !== undefined
      ? envCap(`VEEGPT_TIER_VGU_${P}_${T}`, maxVGURaw ?? -1)
      : maxVGURaw;

  const maxRequests =
    process.env[`VEEGPT_TIER_REQUESTS_${P}_${T}`] !== undefined
      ? envCap(`VEEGPT_TIER_REQUESTS_${P}_${T}`, access.maxRequests ?? -1)
      : access.maxRequests;

  return {
    access: access.access,
    ...(maxRequests !== undefined && maxRequests !== UNLIMITED
      ? { maxRequests }
      : {}),
    ...(maxVGU !== undefined && maxVGU !== UNLIMITED ? { maxVGU } : {}),
  };
}

/** Plans that have a higher self-serve plan to upgrade to. */
export function canUpgrade(plan: PlanId): boolean {
  return plan === 'free' || plan === 'creator' || plan === 'pro';
}

/** The next plan up, for upgrade copy. */
export const NEXT_PLAN: Partial<Record<PlanId, string>> = {
  free: 'Creator',
  creator: 'Pro',
  pro: 'Business',
};

// ---------------------------------------------------------------------------
// Usage warning bands (spec §42)
// ---------------------------------------------------------------------------

/**
 * A usage-warning severity. `none` means show nothing at all.
 *
 * Spec §42 is explicit that normal users must NOT constantly see "37/1200 VGU".
 * The product speaks in plain language and only when it matters, so the bands are
 * silent until 70% and escalate from there.
 */
export type UsageBand = 'none' | 'heavy' | 'approaching' | 'almost' | 'reached';

export interface UsageNotice {
  band: UsageBand;
  /** The exact §42 sentence, or null when nothing should be shown. */
  message: string | null;
  /** The fraction (0–1) this was derived from, for the client's own gauge. */
  fraction: number;
}

/**
 * Which usage window a notice describes. The 5-hour rolling burst budget
 * ('session') and the billing-period budget ('monthly') hit the same bands but
 * need different wording — a session cap frees up on its own in hours, whereas
 * the monthly cap only resets at the period boundary (or with an upgrade).
 */
export type UsageScope = 'monthly' | 'session';

/**
 * Turn a used/limit pair into the plain-language notice §42 prescribes.
 *
 * The thresholds are the spec's. `scope` selects the wording so a 5-hour burst
 * limit is never mislabeled as the monthly allowance. An unlimited plan
 * (limit ≤ 0 or non-finite) never warns — there is nothing to be close to.
 */
export function usageNotice(
  used: number,
  limit: number,
  scope: UsageScope = 'monthly'
): UsageNotice {
  if (!Number.isFinite(limit) || limit <= 0) {
    return { band: 'none', message: null, fraction: 0 };
  }
  const isSession = scope === 'session';
  const fraction = Math.max(0, used / limit);
  if (fraction >= 1) {
    return {
      band: 'reached',
      message: isSession
        ? "You've hit your VeeGPT usage limit for now."
        : 'Your monthly VeeGPT allowance has been reached.',
      fraction,
    };
  }
  if (fraction >= 0.95) {
    return {
      band: 'almost',
      message: isSession
        ? "You're almost at your VeeGPT usage limit for now."
        : "You're almost at your monthly VeeGPT limit.",
      fraction,
    };
  }
  if (fraction >= 0.85) {
    return {
      band: 'approaching',
      message: isSession
        ? "You're getting close to your VeeGPT usage limit for now."
        : "You're getting close to your VeeGPT allowance.",
      fraction,
    };
  }
  if (fraction >= 0.7) {
    return {
      band: 'heavy',
      message: isSession
        ? "You're using VeeGPT heavily right now."
        : "You're using VeeGPT heavily this month.",
      fraction,
    };
  }
  return { band: 'none', message: null, fraction };
}

// ---------------------------------------------------------------------------
// Structured error codes (spec §28, §65)
// ---------------------------------------------------------------------------

/**
 * Machine-readable refusal codes. The client keys its copy and its
 * "Continue with Fast / Upgrade" affordances off these, so no refusal is ever a
 * bare 429 and no model is ever silently swapped.
 */
export const VGU_ERROR = {
  /** The rolling 5-hour burst budget is spent. */
  BURST_QUOTA_EXHAUSTED: 'BURST_QUOTA_EXHAUSTED',
  /** The billing-period budget is spent. */
  MONTHLY_QUOTA_EXHAUSTED: 'MONTHLY_QUOTA_EXHAUSTED',
  /** The selected model's tier allowance is spent (premium/ultra sub-cap). */
  MODEL_QUOTA_EXHAUSTED: 'MODEL_QUOTA_EXHAUSTED',
  /** The plan has no access to this tier at all. */
  MODEL_NOT_IN_PLAN: 'MODEL_NOT_IN_PLAN',
  /** A per-feature monthly cap is spent (deep research, autopilot). */
  FEATURE_QUOTA_EXHAUSTED: 'FEATURE_QUOTA_EXHAUSTED',
  /** Too many simultaneous AI operations for this user. */
  CONCURRENCY_LIMIT: 'CONCURRENCY_LIMIT',
  /** Too many simultaneous AI operations across the whole workspace (§39). */
  WORKSPACE_CONCURRENCY_LIMIT: 'WORKSPACE_CONCURRENCY_LIMIT',
  /**
   * Too many simultaneous runs of ONE feature (§22: max concurrent research
   * jobs, §23: autopilot concurrency). Distinct from the plan-wide limit: a user
   * may have a chat turn and a research job open at once, but not three research
   * jobs.
   */
  FEATURE_CONCURRENCY_LIMIT: 'FEATURE_CONCURRENCY_LIMIT',
  /** Request-rate cap (per minute). */
  RATE_LIMITED: 'RATE_LIMITED',
  /** The shared workspace pool is spent (Business). */
  WORKSPACE_POOL_EXHAUSTED: 'WORKSPACE_POOL_EXHAUSTED',
  /** This seat has used its share of the shared pool. */
  SEAT_SHARE_EXHAUSTED: 'SEAT_SHARE_EXHAUSTED',
  /** Quota state could not be verified and the request is too expensive to risk. */
  QUOTA_UNVERIFIABLE: 'QUOTA_UNVERIFIABLE',
  /** An administrator has disabled this model/feature/provider. */
  DISABLED_BY_ADMIN: 'DISABLED_BY_ADMIN',
  /**
   * Abuse signals reached the blocking threshold. Distinct from a quota code
   * because the remedy is different: quota resets with time, this needs review.
   */
  ABUSE_DETECTED: 'ABUSE_DETECTED',
  /**
   * Abuse signals reached the restrict threshold, so expensive tiers are refused
   * while cheap models keep working — a heuristic must not take the product away.
   */
  ABUSE_TIER_RESTRICTED: 'ABUSE_TIER_RESTRICTED',
} as const;

export type VGUErrorCode = (typeof VGU_ERROR)[keyof typeof VGU_ERROR];
