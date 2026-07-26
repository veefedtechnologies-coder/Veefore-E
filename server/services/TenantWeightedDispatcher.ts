/**
 * TenantWeightedDispatcher — Optional Tenant Priority Weighting (Req 13)
 *
 * An optional extension to dispatch selection used by the `TieredJobScheduler`
 * during contention (pending jobs exceed available worker capacity). It decides
 * which tenant's pending work should be dispatched next so that, over a rolling
 * fairness window, the share of dispatched jobs per tenant tracks that tenant's
 * configured priority weight — without ever starving a smaller tenant.
 *
 * Two modes, driven purely by `config.smartPolling.tenantPriority`:
 *
 *  1. **Enabled** (`tenantPriority.enabled === true`): dispatched jobs are
 *     allocated to each tenant in proportion to its normalized configured
 *     weight, measured over a rolling window (`tenantPriority.windowMs`, default
 *     60s), staying within ±10 percentage points of the tenant's target share
 *     (Req 13.1). Every tenant with pending jobs is guaranteed at least one
 *     dispatch per window (Req 13.2): a tenant that has not yet been served in
 *     the current window is always chosen ahead of any tenant that already has,
 *     so no tenant is starved before any other receives a second job.
 *
 *  2. **Disabled** (`tenantPriority.enabled === false`): jobs are allocated to
 *     each tenant with pending work in equal shares (round-robin), independent
 *     of any configured weight (Req 13.3).
 *
 * Weights are loaded from `RateLimitConfig` and never hardcoded (Req 13.4). A
 * missing or invalid weight defaults to 1 and surfaces a configuration warning
 * via `resolveWeight` (Req 13.5).
 *
 * `selectNextTenant` is a deterministic pure function of its inputs and the
 * injected config; `resolveWeight` is exported as a pure static so it can be
 * unit/property tested in isolation.
 *
 * Requirements covered: 13.1, 13.2, 13.3, 13.4, 13.5
 */

import { logger } from '../config/logger';
import type { RateLimitConfig } from '../config/rateLimitConfig';

/** Minimum allowed tenant weight (inclusive). */
const MIN_WEIGHT = 1;
/** Maximum allowed tenant weight (inclusive). */
const MAX_WEIGHT = 1000;
/** Default weight applied to a tenant with a missing/invalid configured weight. */
const DEFAULT_WEIGHT = 1;

/**
 * A tenant that currently has at least one pending job awaiting dispatch.
 * `pendingCount` is optional metadata (not required for selection) describing
 * how many jobs the tenant has queued.
 */
export interface TenantPending {
  /** Stable tenant identifier (e.g. workspace id). */
  tenantId: string;
  /** Optional number of pending jobs for this tenant. */
  pendingCount?: number;
}

export class TenantWeightedDispatcher {
  private readonly config: RateLimitConfig;

  /**
   * @param config Rate-limit configuration; `smartPolling.tenantPriority`
   *               supplies the enable flag, per-tenant weights, and window.
   */
  constructor(config: RateLimitConfig) {
    this.config = config;
  }

  /**
   * Choose the next tenant to dispatch under contention (Req 13.1–13.3).
   *
   * - **enabled**  ⇒ proportional to normalized weights over the rolling
   *   window, within ±10pp, guaranteeing ≥1 job/tenant/window (Req 13.1, 13.2).
   * - **disabled** ⇒ equal shares / round-robin (Req 13.3).
   *
   * @param pending      Tenants that currently have pending jobs.
   * @param windowCounts Jobs already dispatched per tenant in the current
   *                     rolling window (`tenantId → count`). A missing entry is
   *                     treated as 0.
   * @returns The `tenantId` to dispatch next, or `''` when `pending` is empty.
   */
  selectNextTenant(pending: TenantPending[], windowCounts: Record<string, number>): string {
    if (pending.length === 0) {
      return '';
    }
    if (pending.length === 1) {
      return pending[0].tenantId;
    }

    const count = (tenantId: string): number => {
      const c = windowCounts[tenantId];
      return typeof c === 'number' && Number.isFinite(c) && c > 0 ? c : 0;
    };

    if (!this.config.smartPolling.tenantPriority.enabled) {
      return this.selectEqualShare(pending, count);
    }
    return this.selectWeighted(pending, count);
  }

  /**
   * Equal-share selection (Req 13.3): pick the pending tenant that has received
   * the fewest dispatches so far in the window. Ties break deterministically by
   * `tenantId` so the choice is reproducible.
   */
  private selectEqualShare(
    pending: TenantPending[],
    count: (tenantId: string) => number
  ): string {
    let best = pending[0].tenantId;
    let bestCount = count(best);

    for (const { tenantId } of pending) {
      const c = count(tenantId);
      if (c < bestCount || (c === bestCount && tenantId < best)) {
        best = tenantId;
        bestCount = c;
      }
    }
    return best;
  }

  /**
   * Weighted selection (Req 13.1, 13.2).
   *
   * Guarantee ≥1 dispatch/tenant/window: any pending tenant that has not yet
   * been served in this window (`count === 0`) is chosen ahead of any tenant
   * that already has been. Among unserved tenants the highest-weight tenant
   * wins, so no tenant can be starved before every tenant has one job.
   *
   * Once every pending tenant has at least one dispatch, pick the tenant whose
   * actual share of window dispatches is furthest *below* its normalized target
   * weight share. This drives each tenant's realized share toward its target,
   * keeping allocations within ±10pp over the window.
   *
   * Ties break deterministically by `tenantId`.
   */
  private selectWeighted(
    pending: TenantPending[],
    count: (tenantId: string) => number
  ): string {
    const weights = this.config.smartPolling.tenantPriority.weights;
    const resolved = new Map<string, number>();
    for (const { tenantId } of pending) {
      resolved.set(tenantId, TenantWeightedDispatcher.resolveWeight(tenantId, weights));
    }

    // Phase 1: guarantee each pending tenant gets at least one job per window.
    const unserved = pending.filter(({ tenantId }) => count(tenantId) === 0);
    if (unserved.length > 0) {
      let best = unserved[0].tenantId;
      let bestWeight = resolved.get(best) ?? DEFAULT_WEIGHT;
      for (const { tenantId } of unserved) {
        const w = resolved.get(tenantId) ?? DEFAULT_WEIGHT;
        if (w > bestWeight || (w === bestWeight && tenantId < best)) {
          best = tenantId;
          bestWeight = w;
        }
      }
      return best;
    }

    // Phase 2: track normalized weight shares — pick the largest deficit.
    let totalWeight = 0;
    let totalCount = 0;
    for (const { tenantId } of pending) {
      totalWeight += resolved.get(tenantId) ?? DEFAULT_WEIGHT;
      totalCount += count(tenantId);
    }

    let best = pending[0].tenantId;
    let bestDeficit = -Infinity;
    for (const { tenantId } of pending) {
      const targetShare = (resolved.get(tenantId) ?? DEFAULT_WEIGHT) / totalWeight;
      const actualShare = totalCount > 0 ? count(tenantId) / totalCount : 0;
      const deficit = targetShare - actualShare;
      if (deficit > bestDeficit || (deficit === bestDeficit && tenantId < best)) {
        best = tenantId;
        bestDeficit = deficit;
      }
    }
    return best;
  }

  /**
   * Resolve a tenant's priority weight (Req 13.4, 13.5).
   *
   * Pure and side-effect-free apart from a configuration warning when a value
   * is missing or invalid. A weight is valid only if it is a finite number in
   * the inclusive range [1, 1000]; any missing entry, non-number, `NaN`, value
   * below 1, or value above 1000 defaults to 1 and surfaces a configuration
   * warning so the misconfiguration is observable. The returned value is always
   * within [1, 1000].
   *
   * @param tenantId The tenant whose weight to resolve.
   * @param weights  The configured `tenantId → weight` map.
   * @returns A weight in [1, 1000]; 1 for missing/invalid input.
   *
   * @example
   * TenantWeightedDispatcher.resolveWeight('a', { a: 50 });   // => 50
   * TenantWeightedDispatcher.resolveWeight('a', {});          // => 1 (+ warning)
   * TenantWeightedDispatcher.resolveWeight('a', { a: 5000 }); // => 1 (+ warning)
   */
  static resolveWeight(tenantId: string, weights: Record<string, number>): number {
    const raw = weights ? weights[tenantId] : undefined;

    if (
      typeof raw !== 'number' ||
      !Number.isFinite(raw) ||
      raw < MIN_WEIGHT ||
      raw > MAX_WEIGHT
    ) {
      logger.warn('[TenantWeightedDispatcher] invalid/missing tenant weight; defaulting to 1', {
        component: 'TenantWeightedDispatcher',
        tenantId,
        configuredWeight: raw,
        defaultedTo: DEFAULT_WEIGHT,
      });
      return DEFAULT_WEIGHT;
    }

    return raw;
  }
}
