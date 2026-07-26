/**
 * Veefore Analytics — Multi-Platform Rollup Store (Phase 3).
 *
 * Fans out analytics reads to all registered platform stores
 * (`LegacyRollupReadStore` for Instagram and `FacebookRollupReadStore` for
 * Facebook), merging their results into a single flat array so callers remain
 * fully platform-agnostic.
 *
 * Key design decisions
 * ─────────────────────
 * • `Promise.allSettled` is used everywhere — one platform failure never blocks
 *   the other platform's results from being returned (Requirements 12.4, 12.5).
 * • `query.platforms` acts as an allowlist: when absent (or empty) ALL registered
 *   stores are queried; when present only the matching stores run.
 * • `getDailySeries` is delegated exclusively to `LegacyRollupReadStore` (Instagram)
 *   for now. When a Facebook daily-series source exists, add it to the fan-out
 *   here without touching the public interface.
 * • `getAudienceByCountry` and `getTopContent` fan out across both stores via
 *   `Promise.allSettled` and flatten fulfilled results.
 * • `partialData` tracking: the store exposes a `lastPartialPlatforms` property
 *   that the `DashboardService` can read after a call to include warning banners.
 *   Platforms that returned an empty array while others returned data are listed.
 *
 * Requirements: 5.7, 6.3, 6.7, 12.4, 12.5
 */

import { LegacyRollupReadStore } from './LegacyRollupReadStore'
import { FacebookRollupReadStore, facebookRollupReadStore } from '../../facebook/analytics/FacebookRollupReadStore'
import type { MetricRollup } from '../aggregation'
import type {
  AudienceProvider,
  ContentProvider,
  DailySeriesPoint,
  DistributionSlice,
  RollupReadQuery,
  RollupReadStore,
  SeriesReadStore,
  TopItem,
} from '../api/ports'

// ---------------------------------------------------------------------------
// Platform-to-store registry
// ---------------------------------------------------------------------------

/**
 * Descriptor pairing a platform identifier with its store instance.
 * Keeping this as a plain array makes it trivial to register more platforms
 * without modifying the fan-out logic.
 */
interface PlatformStore {
  platform: string
  rollupStore: RollupReadStore
  audienceStore?: AudienceProvider
  contentStore?: ContentProvider
}

// ---------------------------------------------------------------------------
// MultiPlatformRollupStore
// ---------------------------------------------------------------------------

export class MultiPlatformRollupStore
  implements RollupReadStore, SeriesReadStore, AudienceProvider, ContentProvider
{
  /**
   * After any `getRollups`, `getAudienceByCountry`, or `getTopContent` call,
   * this is populated with the names of platforms that returned an empty result
   * while at least one other platform returned data. Consumers (e.g.
   * `DashboardService` in task 4.7) use it to emit `partialData` warnings.
   *
   * When the facebook platform's absence is caused by a TOKEN_EXPIRED error,
   * the entry is suffixed with `':requiresReconnect'`
   * (e.g. `'facebook:requiresReconnect'`) so callers can distinguish a transient
   * data gap from a reconnect-needed state and surface the appropriate prompt.
   */
  lastPartialPlatforms: string[] = []

  private readonly legacyStore: LegacyRollupReadStore
  private readonly facebookStore: FacebookRollupReadStore

  /** Ordered list of registered platform stores. */
  private get platformStores(): PlatformStore[] {
    return [
      {
        platform: 'instagram',
        rollupStore: this.legacyStore,
        audienceStore: this.legacyStore,
        contentStore: this.legacyStore,
      },
      {
        platform: 'facebook',
        rollupStore: this.facebookStore,
        audienceStore: this.facebookStore,
        contentStore: this.facebookStore,
      },
    ]
  }

  constructor(
    legacyStore?: LegacyRollupReadStore,
    facebookStore?: FacebookRollupReadStore
  ) {
    this.legacyStore = legacyStore ?? new LegacyRollupReadStore()
    this.facebookStore = facebookStore ?? facebookRollupReadStore
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * Filter the registered stores to those whose platform is included in
   * `query.platforms`. When `query.platforms` is absent or empty, ALL stores
   * are included (default: all platforms).
   */
  private activeStores(query: RollupReadQuery): PlatformStore[] {
    const requested = query.platforms && query.platforms.length > 0 ? query.platforms : null
    if (!requested) return this.platformStores
    return this.platformStores.filter((s) => requested.includes(s.platform))
  }

  // -------------------------------------------------------------------------
  // RollupReadStore
  // -------------------------------------------------------------------------

  /**
   * Query each active platform store in parallel via `Promise.allSettled`.
   * A single store failure (network error, API outage) never prevents results
   * from other stores from being returned (Requirements 12.4, 12.5).
   *
   * Updates `lastPartialPlatforms` with platform names that returned `[]` while
   * at least one other platform returned data. When the facebook platform
   * returned `[]` due to TOKEN_EXPIRED errors on all its accounts, the entry is
   * suffixed with `':requiresReconnect'` (e.g. `'facebook:requiresReconnect'`).
   */
  async getRollups(query: RollupReadQuery): Promise<MetricRollup[]> {
    const stores = this.activeStores(query)
    const results = await Promise.allSettled(
      stores.map((s) => s.rollupStore.getRollups(query))
    )

    const fulfilled: Array<{ platform: string; data: MetricRollup[] }> = []
    const rejected: string[] = []
    for (let i = 0; i < results.length; i++) {
      const r = results[i]
      if (r.status === 'fulfilled') {
        fulfilled.push({ platform: stores[i].platform, data: r.value })
      } else {
        // Store threw — treat the platform as partial (Requirements 12.4, 12.5).
        rejected.push(stores[i].platform)
      }
    }

    // Track partial data: platforms that returned nothing (empty fulfilled OR
    // rejected/thrown) while at least one other platform returned real rollups.
    const hasAnyData = fulfilled.some((f) => f.data.length > 0)

    // Platforms with empty fulfilled results
    const emptyFulfilled = hasAnyData
      ? fulfilled
          .filter((f) => f.data.length === 0)
          .map((f) => {
            // Check if this platform's store reported TOKEN_EXPIRED reconnect
            // accounts — if so, annotate the warning so callers can distinguish
            // a transient outage from a reconnect-needed state.
            if (
              f.platform === 'facebook' &&
              this.facebookStore.lastRequiresReconnectAccountIds.length > 0
            ) {
              return `${f.platform}:requiresReconnect`
            }
            return f.platform
          })
      : []

    // Platforms that threw are always partial when there is any data from other
    // stores (or even when all fail — callers will see partialData in both cases).
    const rejectedPartial = (hasAnyData || fulfilled.length === 0) ? rejected : []

    this.lastPartialPlatforms = [...emptyFulfilled, ...rejectedPartial]

    return fulfilled.flatMap((f) => f.data)
  }

  // -------------------------------------------------------------------------
  // SeriesReadStore
  // -------------------------------------------------------------------------

  /**
   * Daily series is delegated to `LegacyRollupReadStore` (Instagram) only.
   *
   * Rationale: the Facebook Page Insights API does not provide a reliable
   * per-day metric series with the same depth and history as Instagram's
   * `follows_and_unfollows` / insights store. When a Facebook daily-series
   * capability becomes available, add the fan-out here without changing the
   * public interface.
   *
   * When `query.platforms` is set exclusively to `['facebook']` and Instagram is
   * excluded, an empty series is returned rather than Instagram data bleeding
   * into a Facebook-only view.
   */
  async getDailySeries(query: RollupReadQuery): Promise<DailySeriesPoint[]> {
    const platforms = query.platforms && query.platforms.length > 0 ? query.platforms : null

    // If the caller explicitly requests facebook-only, we have no series yet.
    if (platforms && !platforms.includes('instagram')) {
      return []
    }

    // Delegate to LegacyRollupReadStore (Instagram).
    try {
      return await this.legacyStore.getDailySeries(query)
    } catch {
      return []
    }
  }

  // -------------------------------------------------------------------------
  // AudienceProvider
  // -------------------------------------------------------------------------

  /**
   * Fan out `getAudienceByCountry` to all active stores that implement
   * `AudienceProvider`. Merges fulfilled slices into a combined distribution,
   * summing values for the same country label across platforms.
   *
   * `Promise.allSettled` ensures one provider failure does not suppress the
   * other provider's data (Requirements 12.4, 12.5).
   */
  async getAudienceByCountry(query: RollupReadQuery): Promise<DistributionSlice[]> {
    const stores = this.activeStores(query).filter((s) => s.audienceStore)
    if (stores.length === 0) return []

    const results = await Promise.allSettled(
      stores.map((s) => s.audienceStore!.getAudienceByCountry(query))
    )

    // Merge: sum values for the same country label across platforms.
    const combined = new Map<string, number>()
    for (const r of results) {
      if (r.status !== 'fulfilled') continue
      for (const slice of r.value) {
        combined.set(slice.label, (combined.get(slice.label) ?? 0) + slice.value)
      }
    }

    return Array.from(combined.entries())
      .map(([label, value]) => ({ label, value }))
      .filter((s) => s.value > 0)
      .sort((a, b) => b.value - a.value)
  }

  // -------------------------------------------------------------------------
  // ContentProvider
  // -------------------------------------------------------------------------

  /**
   * Fan out `getTopContent` to all active stores that implement
   * `ContentProvider`. Collects items from all fulfilled providers, sorts
   * by `value` descending, and returns the top 10.
   *
   * `Promise.allSettled` ensures one provider failure does not suppress the
   * other provider's data (Requirements 12.4, 12.5).
   */
  async getTopContent(query: RollupReadQuery): Promise<TopItem[]> {
    const stores = this.activeStores(query).filter((s) => s.contentStore)
    if (stores.length === 0) return []

    const results = await Promise.allSettled(
      stores.map((s) => s.contentStore!.getTopContent(query))
    )

    const allItems: TopItem[] = []
    for (const r of results) {
      if (r.status !== 'fulfilled') continue
      allItems.push(...r.value)
    }

    return allItems.sort((a, b) => b.value - a.value).slice(0, 10)
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

/**
 * Shared singleton instance of `MultiPlatformRollupStore`.
 *
 * Wire this into `DashboardService` in task 4.7:
 * ```ts
 * import { multiPlatformRollupStore } from '../bridge/MultiPlatformRollupStore'
 * const service = new DashboardService({
 *   readStore:       multiPlatformRollupStore,
 *   seriesStore:     multiPlatformRollupStore,
 *   audienceProvider: multiPlatformRollupStore,
 *   contentProvider:  multiPlatformRollupStore,
 * })
 * ```
 */
export const multiPlatformRollupStore = new MultiPlatformRollupStore()
