/**
 * Emergency admin controls (spec §48, §49).
 *
 * Runtime levers an administrator can pull WITHOUT a redeploy to contain a cost
 * incident: disable a model, a whole tier, a feature or a provider; throttle
 * concurrency globally; or dial the estimate multipliers down. Every change is
 * versioned, attributed, and audited.
 *
 * WHY REDIS-BACKED WITH AN IN-MEMORY CACHE
 * The reservation engine consults these on the HOT PATH — once per AI request —
 * so reading Redis every time would add a round trip to every reservation. The
 * controls are therefore cached in-process for a few seconds. The trade-off is
 * bounded and deliberate: a kill switch takes effect within the cache TTL across
 * every instance, not instantly, which for a cost-containment lever (minutes-long
 * incidents) is entirely acceptable. `refreshAdminControls()` forces an immediate
 * reload after a change so the instance that made it sees it at once.
 *
 * FAIL-SAFE READING
 * If Redis is unavailable the controls read as "nothing disabled". That is the
 * correct default: the controls are a SAFETY brake, and a brake that jams on when
 * its wiring fails would take the product down. Cost itself is still bounded by
 * the VGU engine, which fails CLOSED for expensive requests independently.
 */

import { getRedisClient } from '../lib/redis';
import type { ModelTier } from '@shared/veegpt-model-tiers';
import logger from '../config/logger';

/** The single Redis key holding the serialized controls document. */
const CONTROLS_KEY = 'vgu:admin:controls';

/** How long the in-process cache is trusted before a reload. */
const CACHE_TTL_MS = 5_000;

export interface AdminControls {
  /** App-level model ids that are hard-disabled (e.g. "openai-gpt4o"). */
  disabledModels: string[];
  /** Whole tiers disabled — the fast lever for "turn Premium/Ultra off". */
  disabledTiers: ModelTier[];
  /** Feature labels disabled (e.g. "veegpt.deep_research", "veegpt.autopilot"). */
  disabledFeatures: string[];
  /** Providers disabled (e.g. "openai", "gemini"). */
  disabledProviders: string[];
  /**
   * Global concurrency multiplier (0–1). Combines with the plan limit and the
   * abuse throttle to reduce how many AI operations run at once fleet-wide. 1 =
   * no change; a value below 1 tightens; 0 pauses new AI entirely.
   */
  concurrencyFactor: number;
  /**
   * Per-tier ESTIMATE multiplier overrides. Lowers how much is reserved up front
   * for a tier during an incident. Does not change the reconciled charge, which
   * is measured from real tokens.
   */
  tierMultiplier: Partial<Record<ModelTier, number>>;
  /** Per-feature estimate multiplier overrides, same idea as tierMultiplier. */
  featureMultiplier: Record<string, number>;
  /** Bookkeeping: who last changed this, when, why, and a monotonically rising version. */
  version: number;
  updatedAt: string | null;
  updatedBy: string | null;
  reason: string | null;
}

/** The neutral default: everything on, nothing throttled. */
export function defaultControls(): AdminControls {
  return {
    disabledModels: [],
    disabledTiers: [],
    disabledFeatures: [],
    disabledProviders: [],
    concurrencyFactor: 1,
    tierMultiplier: {},
    featureMultiplier: {},
    version: 0,
    updatedAt: null,
    updatedBy: null,
    reason: null,
  };
}

let cache: { at: number; value: AdminControls } | null = null;

/**
 * Coerce a parsed blob into a well-formed controls object (defensive).
 *
 * Exported as a PURE function so the normalization rules — clamp the
 * concurrency factor to [0,1], drop non-string array members, lower-case
 * provider names, never let a hostile/garbled document weaken the brake — can
 * be unit-tested without Redis.
 */
export function normalizeControls(raw: unknown): AdminControls {
  const d = defaultControls();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Partial<AdminControls>;
  const strArr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter(x => typeof x === 'string') : [];
  const numMap = (v: unknown): Record<string, number> => {
    const out: Record<string, number> = {};
    if (v && typeof v === 'object') {
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        const n = Number(val);
        if (Number.isFinite(n) && n >= 0) out[k] = n;
      }
    }
    return out;
  };
  const factor = Number(r.concurrencyFactor);
  return {
    disabledModels: strArr(r.disabledModels),
    disabledTiers: strArr(r.disabledTiers) as ModelTier[],
    disabledFeatures: strArr(r.disabledFeatures),
    disabledProviders: strArr(r.disabledProviders).map(p => p.toLowerCase()),
    concurrencyFactor:
      Number.isFinite(factor) && factor >= 0 && factor <= 1 ? factor : 1,
    tierMultiplier: numMap(r.tierMultiplier) as Partial<Record<ModelTier, number>>,
    featureMultiplier: numMap(r.featureMultiplier),
    version: Number.isFinite(Number(r.version)) ? Number(r.version) : 0,
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : null,
    updatedBy: typeof r.updatedBy === 'string' ? r.updatedBy : null,
    reason: typeof r.reason === 'string' ? r.reason : null,
  };
}

/**
 * The current controls, from the in-process cache (hot-path safe). Never throws
 * and never blocks: a Redis miss/error yields the neutral default.
 */
export function getAdminControls(): AdminControls {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
  // Serve the stale value while a refresh runs in the background, so the hot path
  // is never blocked on Redis. First call (no cache) returns the default and
  // triggers the load.
  void refreshAdminControls();
  return cache?.value ?? defaultControls();
}

/** Reload the controls from Redis into the cache. Returns the fresh value. */
export async function refreshAdminControls(): Promise<AdminControls> {
  try {
    const raw = await getRedisClient().get(CONTROLS_KEY);
    const value = raw ? normalizeControls(JSON.parse(raw)) : defaultControls();
    cache = { at: Date.now(), value };
    return value;
  } catch (err) {
    logger.warn('vgu-admin: controls read failed — treating as none disabled', {
      err: err instanceof Error ? err.message : String(err),
      module: 'veegpt-admin-controls',
    });
    // Cache the default briefly so we do not hammer a dead Redis every request.
    cache = { at: Date.now(), value: cache?.value ?? defaultControls() };
    return cache.value;
  }
}

/** An awaited read, for admin surfaces that need the authoritative value. */
export async function loadAdminControls(): Promise<AdminControls> {
  return refreshAdminControls();
}

export interface AdminChangeContext {
  /** Identifier of the administrator making the change (for the audit trail). */
  adminId: string;
  /** Human reason — required by §49. */
  reason: string;
}

/**
 * Apply a partial change to the controls, audited.
 *
 * Returns the previous and next documents so the caller (the admin route) can
 * record administrator / previous value / new value / timestamp / reason exactly
 * as §49 requires. The version increments on every change so concurrent edits are
 * detectable and the audit trail is ordered.
 */
export async function updateAdminControls(
  patch: Partial<
    Pick<
      AdminControls,
      | 'disabledModels'
      | 'disabledTiers'
      | 'disabledFeatures'
      | 'disabledProviders'
      | 'concurrencyFactor'
      | 'tierMultiplier'
      | 'featureMultiplier'
    >
  >,
  ctx: AdminChangeContext
): Promise<{ previous: AdminControls; next: AdminControls }> {
  const previous = await refreshAdminControls();
  const next = normalizeControls({
    ...previous,
    ...patch,
    version: previous.version + 1,
    updatedAt: new Date().toISOString(),
    updatedBy: ctx.adminId,
    reason: ctx.reason,
  });
  await getRedisClient().set(CONTROLS_KEY, JSON.stringify(next));
  cache = { at: Date.now(), value: next };
  logger.warn('vgu-admin: emergency controls changed', {
    adminId: ctx.adminId,
    reason: ctx.reason,
    version: next.version,
    disabledModels: next.disabledModels,
    disabledTiers: next.disabledTiers,
    disabledFeatures: next.disabledFeatures,
    disabledProviders: next.disabledProviders,
    concurrencyFactor: next.concurrencyFactor,
    module: 'veegpt-admin-controls',
  });
  return { previous, next };
}

/** Reset every control to neutral, audited (the "all clear" after an incident). */
export async function resetAdminControls(
  ctx: AdminChangeContext
): Promise<{ previous: AdminControls; next: AdminControls }> {
  const previous = await refreshAdminControls();
  const cleared = defaultControls();
  cleared.version = previous.version + 1;
  cleared.updatedAt = new Date().toISOString();
  cleared.updatedBy = ctx.adminId;
  cleared.reason = ctx.reason;
  await getRedisClient().set(CONTROLS_KEY, JSON.stringify(cleared));
  cache = { at: Date.now(), value: cleared };
  logger.warn('vgu-admin: emergency controls reset to neutral', {
    adminId: ctx.adminId,
    reason: ctx.reason,
    version: cleared.version,
    module: 'veegpt-admin-controls',
  });
  return { previous, next: cleared };
}

// ---------------------------------------------------------------------------
// The gate the reservation engine calls
// ---------------------------------------------------------------------------

export interface AdminGateInput {
  feature: string;
  tier: ModelTier;
  model?: string;
  provider?: string;
}

export interface AdminGateResult {
  blocked: boolean;
  /** The human-readable reason, shown to the user when blocked. */
  reason?: string;
  /** Which lever caused the block, for logs. */
  by?: 'model' | 'tier' | 'feature' | 'provider';
}

/**
 * The PURE gate decision: given a controls document and a request, is it
 * disabled? Extracted from `adminGate` so the precedence and messaging can be
 * unit-tested without Redis or the module cache.
 *
 * Precedence is model → tier → feature → provider: the most specific lever wins,
 * so a log reading "by: model" is unambiguous about which switch fired.
 */
export function evaluateAdminGate(
  c: AdminControls,
  input: AdminGateInput
): AdminGateResult {
  if (input.model && c.disabledModels.includes(input.model)) {
    return {
      blocked: true,
      by: 'model',
      reason: 'This model is temporarily unavailable.',
    };
  }
  if (c.disabledTiers.includes(input.tier)) {
    return {
      blocked: true,
      by: 'tier',
      reason:
        input.tier === 'premium' || input.tier === 'ultra'
          ? 'Premium AI is temporarily unavailable.'
          : 'This model tier is temporarily unavailable.',
    };
  }
  if (c.disabledFeatures.includes(input.feature)) {
    return {
      blocked: true,
      by: 'feature',
      reason: 'This feature is temporarily unavailable.',
    };
  }
  if (input.provider && c.disabledProviders.includes(input.provider.toLowerCase())) {
    return {
      blocked: true,
      by: 'provider',
      reason: 'This AI provider is temporarily unavailable.',
    };
  }
  return { blocked: false };
}

/**
 * Is this request disabled by an admin control right now? Reads the cached
 * controls, so it is safe to call on every reservation.
 */
export function adminGate(input: AdminGateInput): AdminGateResult {
  return evaluateAdminGate(getAdminControls(), input);
}

/** The global concurrency multiplier currently in force (1 when none). */
export function adminConcurrencyFactor(): number {
  return getAdminControls().concurrencyFactor;
}

/** Estimate-multiplier override for a tier, or undefined when none is set. */
export function adminTierMultiplier(tier: ModelTier): number | undefined {
  return getAdminControls().tierMultiplier[tier];
}

/** Estimate-multiplier override for a feature, or undefined when none is set. */
export function adminFeatureMultiplier(feature: string): number | undefined {
  return getAdminControls().featureMultiplier[feature];
}

/** Reset the in-process cache. For tests only. */
export function __resetAdminControlsCache(): void {
  cache = null;
}
