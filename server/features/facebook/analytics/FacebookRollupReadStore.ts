/**
 * Veefore Analytics — Facebook Rollup Read Store.
 *
 * Implements {@link RollupReadStore}, {@link AudienceProvider}, and
 * {@link ContentProvider} from `server/features/analytics/api/ports.ts` for
 * Facebook Pages, mirroring the shape of {@link LegacyRollupReadStore} for
 * Instagram so the analytics engine can call both stores interchangeably via
 * {@link MultiPlatformRollupStore}.
 *
 * Key design decisions
 * ─────────────────────
 * • {@link FacebookProvider.getAnalytics} is called once per active Facebook
 *   SocialAccount in the workspace. `Promise.allSettled` ensures a single
 *   account failure does not block results from other accounts.
 * • If no Facebook accounts exist for the workspace `[]` is returned without
 *   error — identical to the behaviour expected of any read store for an
 *   unregistered platform.
 * • `getAudienceByCountry` calls the `page_fans_country` Page Insights metric
 *   with `period: lifetime` so the distribution always reflects the total
 *   accumulated audience, not a windowed slice.
 * • `getTopContent` fetches page posts with engagement fields and returns up to
 *   10 items sorted by engagement descending.
 * • No metric value is fabricated — keys are omitted when the API does not
 *   return them (CODING_RULES Rule 16).
 * • `FacebookApiError` with `type === 'TOKEN_EXPIRED'` is handled by immediately
 *   marking the account as `REQUIRES_RECONNECT` and ceasing polling for it.
 *   The `requiresReconnect` flag is surfaced via the store's
 *   `lastRequiresReconnectAccountIds` set so `MultiPlatformRollupStore` can add
 *   the platform to its `lastPartialPlatforms` warning list.
 * • `FacebookApiError` with `type === 'PERMISSION_DENIED'` is handled by logging
 *   the missing permission and skipping only the affected account's metrics;
 *   unrelated accounts and metrics continue to function normally.
 *
 * Requirements: 7.1, 7.2, 7.5, 7.6, 12.1, 12.2, 12.3
 */

import { getAccessTokenFromAccount } from '../../../storage/converters'
import { socialAccountRepository } from '../../../repositories/SocialAccountRepository'
import { FacebookProvider } from '../providers/FacebookProvider'
import { FacebookApiError } from '../providers/error-mapper'
import { CapabilityGuard } from '../../../../src/shared/platform-registry'
import { logger } from '../../../config/logger'
import type { MetricRollup } from '../../analytics/aggregation'
import type {
  AudienceProvider,
  ContentProvider,
  DistributionSlice,
  RollupReadQuery,
  RollupReadStore,
  TopItem,
} from '../../analytics/api/ports'
import type { ISocialAccount } from '../../../models/Social/SocialAccount'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FB_GRAPH_BASE = 'https://graph.facebook.com'
const FB_API_VERSION = 'v19.0'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/**
 * Return active Facebook SocialAccount records for a workspace.
 * Filters by `platform === 'facebook'` and `isActive === true`.
 * Accounts with `connectionStatus === 'REQUIRES_RECONNECT'` or
 * `connectionStatus === 'DISCONNECTED'` are excluded so we never attempt
 * a live API call with a known-bad token.
 */
async function activeFacebookAccounts(workspaceId: string): Promise<ISocialAccount[]> {
  try {
    const accounts = await socialAccountRepository.findActiveByWorkspace(workspaceId)
    const fbAccounts = accounts.filter(
      (a) =>
        a.platform === 'facebook' &&
        a.connectionStatus !== 'REQUIRES_RECONNECT' &&
        a.connectionStatus !== 'DISCONNECTED'
    )
    logger.info('[FacebookRollupReadStore] activeFacebookAccounts', { workspaceId, total: accounts.length, fb: fbAccounts.length })
    return fbAccounts
  } catch (err) {
    logger.error('[FacebookRollupReadStore] activeFacebookAccounts failed', err, { workspaceId })
    return []
  }
}

// ---------------------------------------------------------------------------
// FacebookRollupReadStore
// ---------------------------------------------------------------------------

export class FacebookRollupReadStore
  implements RollupReadStore, AudienceProvider, ContentProvider
{
  /** Singleton FacebookProvider — re-used across calls. */
  private readonly provider = new FacebookProvider()

  /**
   * After any `getRollups` call, this set is populated with the accountIds of
   * Facebook accounts that responded with TOKEN_EXPIRED. `MultiPlatformRollupStore`
   * checks this after calling `getRollups` to know whether to add 'facebook' to
   * its `lastPartialPlatforms` warning list with a `requiresReconnect` signal.
   *
   * Cleared at the start of each `getRollups` call.
   *
   * Requirements: 12.2
   */
  lastRequiresReconnectAccountIds: string[] = []

  // -------------------------------------------------------------------------
  // RollupReadStore
  // -------------------------------------------------------------------------

  /**
   * Fetch normalized metric rollups for all active Facebook Pages in the
   * workspace. One `MetricRollup` is produced per account; `Promise.allSettled`
   * ensures that a single account failure (expired token, rate limit, etc.) does
   * not prevent the other accounts from contributing their data.
   *
   * Error handling:
   * - `TOKEN_EXPIRED`: immediately calls `socialAccountRepository.setConnectionStatus`
   *   to mark the account `REQUIRES_RECONNECT`, records the accountId in
   *   `lastRequiresReconnectAccountIds`, and returns `null` for that account.
   * - `PERMISSION_DENIED`: logs the missing permission, marks only affected metric
   *   features unavailable via `CapabilityGuard` (console warning), and returns
   *   `null` for that account so unrelated accounts remain functional.
   * - All other errors: swallowed per `Promise.allSettled` contract.
   *
   * Returns `[]` when:
   *  • the workspace has no active Facebook accounts, OR
   *  • every account's analytics fetch fails.
   *
   * Requirements: 7.1, 7.2, 12.1, 12.2, 12.3
   */
  async getRollups(query: RollupReadQuery): Promise<MetricRollup[]> {
    // Reset reconnect tracking for this call.
    this.lastRequiresReconnectAccountIds = []

    const accounts = await activeFacebookAccounts(query.workspaceId)
    if (accounts.length === 0) return []

    const from = query.from ? new Date(query.from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const to = query.to ? new Date(query.to) : new Date()

    const results = await Promise.allSettled(
      accounts.map(async (acc) => {
        const accessToken = getAccessTokenFromAccount(acc)
        if (!accessToken) return null

        const accountId = String(acc.accountId ?? '')
        if (!accountId) return null

        try {
          // ── Step 1: Try durable per-day store first (Redis → MongoDB) ──────────
          // This is the same architecture as Instagram: `getFacebookInsightsRange`
          // reads from AnalyticsDailyMetricModel (stored by the BullMQ backfill
          // worker), returns null when coverage is incomplete, and enqueues a
          // background backfill automatically. On first connect the backfill runs
          // immediately (phase 0) so data populates within minutes.
          let metricsFromStore: Record<string, number> | null = null
          try {
            const { getFacebookInsightsRange } = await import('./facebookInsightsHistory')
            metricsFromStore = await getFacebookInsightsRange(query.workspaceId, accountId, accessToken, from, to)
          } catch {
            // non-fatal — fall through to live API
          }

          let rawMetrics: Record<string, number>

          if (metricsFromStore !== null) {
            // ── Served from durable store — map raw FB keys to normalized names ──
            logger.info('[FacebookRollupReadStore] served from durable store', { accountId, keys: Object.keys(metricsFromStore) })

            // Map the raw stored keys to the normalized metric names
            const { mapFacebookRawMetrics } = await import('./normalizeMetrics')
            rawMetrics = mapFacebookRawMetrics(metricsFromStore)
          } else {
            // ── Durable store not ready — fall back to live API (existing path) ──
            logger.info('[FacebookRollupReadStore] durable store miss — falling back to live API', { accountId })

            // Fetch analytics and profile in parallel
            const [analyticsResult, profileResult] = await Promise.allSettled([
              this.provider.getAnalytics({ accessToken, accountId, from, to }),
              this.provider.getProfile(accessToken, accountId),
            ])

            const result = analyticsResult.status === 'fulfilled' ? analyticsResult.value : { metrics: {} }
            const profile = profileResult.status === 'fulfilled' ? profileResult.value : null

            if (analyticsResult.status === 'rejected') {
              logger.warn('[FacebookRollupReadStore] analytics fetch failed', { accountId, error: (analyticsResult.reason as Error)?.message })
            }
            if (profileResult.status === 'rejected') {
              logger.warn('[FacebookRollupReadStore] profile fetch failed', { accountId, error: (profileResult.reason as Error)?.message })
            }
            logger.info('[FacebookRollupReadStore] analytics result', { accountId, metricKeys: Object.keys(result.metrics), profileFollowers: profile?.followersCount })

            rawMetrics = { ...result.metrics }

            // Inject followers_total from the profile (fan_count)
            if (profile && typeof profile.followersCount === 'number') {
              rawMetrics.followers_total = profile.followersCount
            }
          }

          const metrics = { ...rawMetrics }

          // Also inject published_posts from stored Content if not in analytics
          if (!metrics.published_posts) {
            try {
              const { ContentModel } = await import('../../../models/Content/Content')
              const count = await ContentModel.countDocuments({
                workspaceId: query.workspaceId,
                accountId,
                platform: 'facebook',
                status: 'published',
                publishedAt: { $gte: from, $lte: to },
              })
              if (count > 0) metrics.published_posts = count
            } catch { /* non-fatal */ }
          }

          // Also pull engagement from stored Content (likes + comments + shares).
          // Always run this to get per-metric breakdowns (comments, shares) even when
          // the API already returned a total via page_post_engagements.
          try {
            const { ContentModel } = await import('../../../models/Content/Content')
            const agg = await ContentModel.aggregate([
              {
                $match: {
                  workspaceId: query.workspaceId,
                  accountId,
                  platform: 'facebook',
                  publishedAt: { $gte: from, $lte: to },
                },
              },
              {
                $group: {
                  _id: null,
                  likes: { $sum: '$metrics.likes' },
                  comments: { $sum: '$metrics.comments' },
                  shares: { $sum: '$metrics.shares' },
                },
              },
            ]).exec()
            if (agg?.[0]) {
              const { likes = 0, comments = 0, shares = 0 } = agg[0]
              // Always inject per-metric breakdowns when available — Facebook's
              // Page Insights API only returns total engagements, not individual
              // likes/comments/shares as separate metrics post-2024 deprecation.
              if (likes > 0 && !metrics.likes) metrics.likes = likes
              if (comments > 0) metrics.comments = comments    // always set — not from API
              if (shares > 0) metrics.shares = shares          // always set — not from API
              // Use Content total as fallback when API total is missing/zero
              if (!metrics.total_engagements || metrics.total_engagements === 0) {
                const total = likes + comments + shares
                if (total > 0) metrics.total_engagements = total
              }
            }
          } catch { /* non-fatal */ }

          // Only return a rollup when the provider produced at least one metric.
          const hasData = Object.keys(metrics).length > 0
          if (!hasData) return null

          const rollup: MetricRollup = {
            workspaceId: query.workspaceId,
            platform: 'facebook',
            accountId,
            granularity: query.granularity,
            periodStart: from.toISOString(),
            periodEnd: to.toISOString(),
            metrics,
            eventCount: 1,
            lastEventAt: to.toISOString(),
          }
          return rollup
        } catch (err) {
          if (err instanceof FacebookApiError) {
            if (err.type === 'TOKEN_EXPIRED') {
              // Requirement 12.2: immediately mark as REQUIRES_RECONNECT and
              // stop polling for this account.
              logger.warn('[FacebookRollupReadStore] Token expired — marking REQUIRES_RECONNECT', { accountId })
              try {
                await socialAccountRepository.setConnectionStatus(
                  String((acc as any)._id ?? accountId),
                  'REQUIRES_RECONNECT'
                )
              } catch (dbErr) {
                logger.error('[FacebookRollupReadStore] Failed to update connectionStatus', dbErr, { accountId })
              }
              this.lastRequiresReconnectAccountIds.push(accountId)
              return null
            }

            if (err.type === 'PERMISSION_DENIED') {
              // Requirement 12.3: log the missing permission and mark only the
              // affected features unavailable. Other metrics/accounts continue normally.
              const missingPerm = err.missingPermission ?? 'unknown'
              logger.warn(
                '[FacebookRollupReadStore] Permission denied — missing permission. Consulting CapabilityGuard to identify affected features.',
                { accountId, missingPermission: missingPerm }
              )

              // Use CapabilityGuard to log which analytics metrics require the
              // missing permission. Callers can surface this per-metric label.
              const permissionToMetricMap: Record<string, string[]> = {
                read_insights: ['reach_total', 'impressions_total', 'profile_visits', 'website_clicks'],
                pages_read_engagement: ['total_engagements', 'likes', 'comments', 'shares', 'facebook_reactions'],
                pages_show_list: ['followers_total', 'facebook_page_views'],
              }
              const affectedMetrics = permissionToMetricMap[missingPerm] ?? []
              for (const metricKey of affectedMetrics) {
                const supportLevel = CapabilityGuard.getMetricSupport('facebook', metricKey)
                if (supportLevel !== 'NONE') {
                  logger.warn(
                    '[FacebookRollupReadStore] Feature unavailable due to missing permission',
                    { metricKey, supportLevel, accountId, missingPermission: missingPerm }
                  )
                }
              }
              // Return null for this account only; all others are unaffected.
              return null
            }

            // RATE_LIMITED and UNKNOWN — fall through, return null for this account.
            logger.warn('[FacebookRollupReadStore] FacebookApiError for account', { type: err.type, accountId, message: err.message })
            return null
          }

          // Non-Facebook errors — log and return null for this account.
          logger.error('[FacebookRollupReadStore] Unexpected error fetching analytics for account', err, { accountId })
          return null
        }
      })
    )

    const rollups: MetricRollup[] = []
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value !== null) {
        rollups.push(r.value)
      }
    }
    return rollups
  }

  // -------------------------------------------------------------------------
  // AudienceProvider
  // -------------------------------------------------------------------------

  /**
   * Audience distribution by country via the `page_fans_country` Page Insights
   * metric with `period: lifetime`. The distribution accumulates over the full
   * lifetime of the page — using a shorter period is not meaningful for audience
   * composition and the Graph API does not support windowed fan-country data.
   *
   * Results are sorted descending by value and limited to the top 8 countries.
   *
   * Requirements: 7.5
   */
  async getAudienceByCountry(query: RollupReadQuery): Promise<DistributionSlice[]> {
    const accounts = await activeFacebookAccounts(query.workspaceId)
    if (accounts.length === 0) return []

    const combined: Record<string, number> = {}

    const results = await Promise.allSettled(
      accounts.map(async (acc) => {
        const accessToken = getAccessTokenFromAccount(acc)
        if (!accessToken) return {}

        const accountId = String(acc.accountId ?? '')
        if (!accountId) return {}

        return this.fetchFansByCountry(accessToken, accountId)
      })
    )

    for (const r of results) {
      if (r.status === 'fulfilled') {
        for (const [country, value] of Object.entries(r.value)) {
          if (typeof value === 'number' && value > 0) {
            combined[country] = (combined[country] ?? 0) + value
          }
        }
      }
    }

    return Object.entries(combined)
      .map(([label, value]) => ({ label, value: num(value) }))
      .filter((s) => s.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
  }

  // -------------------------------------------------------------------------
  // ContentProvider
  // -------------------------------------------------------------------------

  /**
   * Top-performing Facebook page posts ranked by total engagement
   * (reactions + comments + shares). Fetches up to 25 recent posts with
   * engagement sub-fields, then returns the top 10.
   *
   * Requirements: 7.6
   */
  async getTopContent(query: RollupReadQuery): Promise<TopItem[]> {
    const accounts = await activeFacebookAccounts(query.workspaceId)
    if (accounts.length === 0) return []

    const allItems: (TopItem & { _sort: number })[] = []

    const results = await Promise.allSettled(
      accounts.map(async (acc) => {
        const accessToken = getAccessTokenFromAccount(acc)
        if (!accessToken) return []

        const accountId = String(acc.accountId ?? '')
        if (!accountId) return []

        return this.fetchTopPosts(accessToken, accountId, query)
      })
    )

    for (const r of results) {
      if (r.status === 'fulfilled') {
        allItems.push(...r.value)
      }
    }

    return allItems
      .sort((a, b) => b._sort - a._sort)
      .slice(0, 10)
      .map(({ _sort, ...item }) => item)
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Call the Graph API `/{accountId}/insights?metric=page_fans_country&period=lifetime`
   * and return a plain `Record<countryCode, count>`.
   * Returns `{}` on any error so the caller can safely merge across accounts.
   */
  private async fetchFansByCountry(
    accessToken: string,
    accountId: string
  ): Promise<Record<string, number>> {
    try {
      const url = new URL(`${FB_GRAPH_BASE}/${FB_API_VERSION}/${accountId}/insights`)
      url.searchParams.set('metric', 'page_fans_country')
      url.searchParams.set('period', 'lifetime')
      url.searchParams.set('access_token', accessToken)

      const response = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) })
      if (!response.ok) return {}

      const json = (await response.json()) as {
        data?: Array<{
          name: string
          values?: Array<{ value: Record<string, number> | number }>
        }>
      }

      for (const metric of json.data ?? []) {
        if (metric.name !== 'page_fans_country') continue
        // lifetime period returns a single entry in values[]
        const latest = metric.values?.[0]?.value
        if (latest && typeof latest === 'object') {
          const out: Record<string, number> = {}
          for (const [k, v] of Object.entries(latest)) {
            if (typeof v === 'number' && v > 0) out[k] = v
          }
          return out
        }
      }
      return {}
    } catch {
      return {}
    }
  }

  /**
   * Fetch up to 25 recent posts for a Facebook Page with engagement fields:
   * reactions count, comments, shares, full_picture, permalink_url, and
   * created_time. Returns scored `TopItem` objects ready for sorting.
   */
  private async fetchTopPosts(
    accessToken: string,
    accountId: string,
    query: RollupReadQuery
  ): Promise<(TopItem & { _sort: number })[]> {
    try {
      const since = query.from
        ? String(Math.floor(new Date(query.from).getTime() / 1000))
        : undefined
      const until = query.to
        ? String(Math.floor(new Date(query.to).getTime() / 1000))
        : undefined

      const url = new URL(`${FB_GRAPH_BASE}/${FB_API_VERSION}/${accountId}/posts`)
      url.searchParams.set(
        'fields',
        'id,message,created_time,full_picture,permalink_url,reactions.summary(true),comments.summary(true),shares'
      )
      url.searchParams.set('limit', '25')
      url.searchParams.set('access_token', accessToken)
      if (since) url.searchParams.set('since', since)
      if (until) url.searchParams.set('until', until)

      const response = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) })
      if (!response.ok) return []

      const json = (await response.json()) as {
        data?: Array<{
          id: string
          message?: string
          created_time?: string
          full_picture?: string
          permalink_url?: string
          reactions?: { summary?: { total_count?: number } }
          comments?: { summary?: { total_count?: number } }
          shares?: { count?: number }
        }>
      }

      return (json.data ?? []).map((post) => {
        const likes = num(post.reactions?.summary?.total_count)
        const comments = num(post.comments?.summary?.total_count)
        const shares = num(post.shares?.count)
        const engagements = likes + comments + shares

        const item: TopItem & { _sort: number } = {
          id: post.id,
          label: post.message
            ? post.message.slice(0, 80) + (post.message.length > 80 ? '…' : '')
            : 'Facebook post',
          value: engagements,
          secondary: `${engagements.toLocaleString()} engagements`,
          thumbnailUrl: post.full_picture,
          permalink: post.permalink_url,
          publishedAt: post.created_time,
          metrics: {
            likes,
            comments,
            shares,
            engagements,
          },
          _sort: engagements,
        }
        return item
      })
    } catch {
      return []
    }
  }
}

/** Singleton instance — consumed by MultiPlatformRollupStore. */
export const facebookRollupReadStore = new FacebookRollupReadStore()
