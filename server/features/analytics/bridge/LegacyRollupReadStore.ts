/**
 * Veefore Analytics — Legacy data bridge (interim).
 *
 * Serves the new dashboard API from the app's EXISTING analytics data
 * (`AnalyticsService`, the `Analytics` collection, and the `Content` collection)
 * so dashboards show REAL numbers today — before platform connectors are wired
 * into the new event pipeline (Phase 7). It maps legacy fields to canonical
 * metric keys and provides audience + top-content data; the Phase 2 metric
 * engine and Phase 11 AI engine then derive KPIs, summaries, and recommendations.
 *
 * This is a bridge: once connectors emit analytics events, swap the route to the
 * Mongo rollup store (server/features/analytics/db) with no API changes. Metrics
 * the legacy data does not track are omitted (KPI renders "—") — nothing is
 * fabricated (CODING_RULES Rule 16).
 */

import { analyticsService } from '../../../services/AnalyticsService'
import { getAccessTokenFromAccount } from '../../../storage/converters'
import { getFollowsRange, type HistoryAccount } from '../history/followsHistory'
import { getInsightsRange, getInsightsDaily } from '../history/insightsHistory'
import { toUtcYmd, clampToNow } from '../history/windowKeys'
import AnalyticsDailyMetricModel from '../../../models/Analytics/AnalyticsDailyMetric'
import { ContentModel } from '../../../models/Content/Content'
import { AnalyticsModel } from '../../../models/Analytics/Analytics'
import InstagramFollowerSnapshotModel from '../../../models/Analytics/InstagramFollowerSnapshot'
import { socialAccountRepository } from '../../../repositories/SocialAccountRepository'
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
} from '../api'
import type { Platform } from '../metrics'

const DAY_MS = 24 * 60 * 60 * 1000

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/** Convert a Mongoose Map or plain object to a plain record. */
function toRecord(mapOrObj: unknown): Record<string, number> {
  if (!mapOrObj) return {}
  if (mapOrObj instanceof Map) return Object.fromEntries(mapOrObj) as Record<string, number>
  return mapOrObj as Record<string, number>
}

interface DailyReachRow {
  date: string
  /** Instagram reach snapshots (rolling, deduped: last per day). */
  reachDay: number
  reachWeek: number
  reachDays28: number
  /** Account reach snapshot (deduped: last per day) — final fallback. */
  reach: number
  followers: number
  likes: number
  comments: number
  shares: number
  views: number
}

/** Which reach snapshot best matches the selected window length. */
type ReachField = 'reachDay' | 'reachWeek' | 'reachDays28' | 'reach'

interface ContentRow {
  _id: unknown
  title?: string
  publishedAt?: Date
  /** contentData stores raw Instagram API fields: media_url, thumbnail_url, media_type, permalink */
  contentData?: {
    media_url?: string
    thumbnail_url?: string
    media_type?: string
    permalink?: string
    id?: string
  }
  metrics?: {
    likes?: number
    comments?: number
    shares?: number
    saves?: number
    reach?: number
    impressions?: number
    views?: number
  }
}

export class LegacyRollupReadStore
  implements RollupReadStore, SeriesReadStore, AudienceProvider, ContentProvider
{
  private resolve(query: RollupReadQuery): { startDate: Date; endDate: Date; platform?: string } {
    const endDate = query.to ? new Date(query.to) : new Date()
    const startDate = query.from ? new Date(query.from) : new Date(endDate.getTime() - 30 * DAY_MS)
    const platform = query.platforms && query.platforms.length === 1 ? query.platforms[0] : undefined
    return { startDate, endDate, platform }
  }

  async getRollups(query: RollupReadQuery): Promise<MetricRollup[]> {
    const { startDate, endDate, platform } = this.resolve(query)

    const [agg, content, failedPosts, dailyReach, followerDaily] = await Promise.all([
      analyticsService.getAggregatedMetrics({ workspaceId: query.workspaceId, startDate, endDate, platform }),
      this.aggregatePublishedContent(query.workspaceId, startDate, endDate, platform),
      this.countPostsByStatus(query.workspaceId, 'failed', startDate, endDate, platform),
      this.getDailyReachRows(query),
      this.getFollowerSnapshotDaily(query.workspaceId, startDate, endDate),
    ])

    // Reach responds to the selected window: pick the matching Instagram reach
    // snapshot (day / week / 28-day / total). The Reach KPI is the latest point
    // of the SAME series the chart plots, so the two can never disagree.
    const field = this.reachFieldFor(startDate, endDate)
    const latestReach = this.latestReach(dailyReach, field)
    const reachTotal = latestReach ?? num(agg.totalReach)

    const metrics: Record<string, number> = {
      // Engagement lives on the Content documents (the daily analytics snapshot
      // does not aggregate per-post interactions), so sum it from Content.
      likes: content.likes,
      comments: content.comments,
      shares: content.shares,
      saves: content.saves,
      reach_total: reachTotal,
      // video_views = sum of per-post metrics.views from Content documents (play counts
      // for videos/reels published in this window). 0 when no video was published in range.
      // Never falls back to legacy Analytics.totalViews — that's account-level impressions,
      // a completely different metric.
      video_views: content.views,
      // Real count of published content documents — NOT the summed daily
      // snapshot counter (which double-counts across days).
      published_posts: content.count,
      failed_posts: failedPosts,
    }

    // Followers come from the genuine daily follower history
    // (`InstagramFollowerSnapshot`, scoped to the active account, deduped per
    // day, zeros dropped) — the SAME source the Home "Monthly Momentum" uses, so
    // analytics matches it. Current total = latest reading in the window; if the
    // window has no snapshot, fall back to the account's live follower count.
    const endsNow = Date.now() - endDate.getTime() < 2 * DAY_MS
    const followerSeries = followerDaily.map((d) => d.followers)
    let followersVal: number | null = followerSeries.length ? followerSeries[followerSeries.length - 1] : null
    if (followersVal === null) followersVal = await this.followersAsOf(query.workspaceId, endDate)
    if (followersVal === null && endsNow) {
      const live = await this.currentFollowers(query.workspaceId)
      if (live > 0) followersVal = live
    }
    // Historical follower TOTAL (e.g. "last year") isn't in the snapshot table,
    // but we can RECONSTRUCT it genuinely: current followers − the net follows
    // (gained − lost) that happened AFTER the window end, using the per-day
    // follows store. This is the standard reconstruction (research doc §2.2) and
    // it unblocks Follower Growth Rate / Churn / Retention, which need this base.
    if (followersVal === null) {
      followersVal = await this.reconstructFollowersAsOf(query.workspaceId, endDate)
    }
    if (followersVal !== null) metrics.followers_total = followersVal

    // Followers gained / lost within the window come DIRECTLY from Instagram's
    // `follows_and_unfollows` insight (breakdown=follow_type): FOLLOWER → gained,
    // NON_FOLLOWER → lost. Meta retains this far longer than the 30-day
    // `follower_count` cap (verified ~24 months), and it exposes the true gross
    // gains AND unfollows — exactly what Hootsuite shows. Works for ANY window
    // (including the comparison window), so we do NOT gate on `endsNow`.
    const flow = await this.getFollowsAndUnfollows(query.workspaceId, startDate, endDate)
    if (flow && (flow.gained > 0 || flow.lost > 0)) {
      metrics.new_followers = flow.gained
      metrics.lost_followers = flow.lost
    } else {
      // Fallback: derive from the genuine daily follower-total snapshots.
      const derived = this.followerFlow(followerSeries)
      if (derived) {
        metrics.new_followers = derived.gained
        metrics.lost_followers = derived.lost
      }
    }

    if (content.impressions > 0) metrics.impressions_total = content.impressions

    // Reach, impressions and engagement for the SELECTED window come from the
    // genuine per-day insights store (Meta `total_value`, ~24-month history),
    // served Redis → MongoDB. This makes these KPIs correct for ANY range
    // (including historical ones and the comparison window) instead of only the
    // recent Content/Analytics snapshots. Falls back to the legacy values above
    // when the window isn't fully in the store yet (worker backfills it).
    const insights = await this.getInsightsTotals(query.workspaceId, startDate, endDate)
    if (insights) {
      metrics.reach_total = num(insights.reach)
      metrics.likes = num(insights.likes)
      metrics.comments = num(insights.comments)
      metrics.shares = num(insights.shares)
      metrics.saves = num(insights.saves)
      // Account-level 'views' = Meta's replacement for 'impressions' (v18+).
      // It counts total content displays across ALL post types — NOT per-video plays.
      // Maps only to impressions_total, never to video_views.
      if (num(insights.views) > 0) metrics.impressions_total = num(insights.views)
      metrics.profile_views = num(insights.profile_views)
      metrics.website_clicks = num(insights.website_clicks)
    }

    const hasData = Object.values(metrics).some((v) => v > 0)
    if (!hasData) return []

    return [
      {
        workspaceId: query.workspaceId,
        // Always set platform for cross-platform aggregation to work correctly.
        // When query.platforms has 1 item, use that; otherwise default to 'instagram'
        // since this store only handles Instagram data.
        platform: (platform ?? 'instagram') as Platform,
        granularity: query.granularity,
        periodStart: startDate.toISOString(),
        periodEnd: endDate.toISOString(),
        metrics,
        eventCount: 1,
        lastEventAt: endDate.toISOString(),
      },
    ]
  }

  async getDailySeries(query: RollupReadQuery): Promise<DailySeriesPoint[]> {
    const { startDate, endDate } = this.resolve(query)
    const [rows, followerDaily, insightsDaily, publishedByDay, failedByDay, followsByDay] = await Promise.all([
      this.getDailyReachRows(query),
      this.getFollowerSnapshotDaily(query.workspaceId, startDate, endDate),
      this.getInsightsDailyRows(query.workspaceId, startDate, endDate),
      this.getPublishedPostsByDay(query.workspaceId, startDate, endDate),
      this.getPostsByStatusPerDay(query.workspaceId, 'failed', startDate, endDate),
      this.getFollowsPerDay(query.workspaceId, startDate, endDate),
    ])

    const field = this.reachFieldFor(startDate, endDate)

    const insightsByDay = new Map(insightsDaily.map((d) => [d.date, d.values]))
    const legacyByDay = new Map(rows.map((d) => [d.date, d]))
    const snapshotByDay = new Map(followerDaily.map((d) => [d.date, d.followers]))
    const publishedMap = new Map(publishedByDay.map((d) => [d.date, d.count]))
    const failedMap = new Map(failedByDay.map((d) => [d.date, d.count]))
    const followsMap = new Map(followsByDay.map((d) => [d.date, d]))

    // Day axis = union of every day that has ANY data, sorted ascending.
    const allDays = Array.from(
      new Set<string>([...insightsByDay.keys(), ...legacyByDay.keys(), ...snapshotByDay.keys(), ...publishedMap.keys(), ...failedMap.keys(), ...followsMap.keys()])
    ).sort((a, b) => (a < b ? -1 : 1))
    if (allDays.length === 0) return []

    // Reconstruct per-day follower totals from the follows_and_unfollows
    // per-day store (genuine, ~24-month history). Walk backwards from the
    // current live count: follower[d] = current - Σ(gained - lost) for days > d.
    // This gives the real follower history line, not just snapshot carry-forward.
    const reconstructedByDay = await this.reconstructDailyFollowerTotals(
      query.workspaceId,
      allDays,
      endDate
    )

    // Prefer reconstruction; fall back to snapshots (carry-forward) per day.
    let lastFollowers = followerDaily.length ? followerDaily[0].followers : 0

    return allDays.map((day) => {
      const snap = snapshotByDay.get(day)
      if (snap && snap > 0) lastFollowers = snap
      const reconstructed = reconstructedByDay.get(day)
      const followersValue = (reconstructed !== undefined && reconstructed > 0)
        ? reconstructed
        : lastFollowers
      const ins = insightsByDay.get(day)
      const legacy = legacyByDay.get(day)
      const engagementFromInsights = ins
        ? num(ins.likes) + num(ins.comments) + num(ins.shares) + num(ins.saves)
        : null
      return {
        date: new Date(day).toISOString(),
        metrics: {
          reach_total: ins ? num(ins.reach) : legacy ? this.reachOf(legacy, field) : 0,
          total_engagements:
            engagementFromInsights ?? (legacy ? legacy.likes + legacy.comments + legacy.shares : 0),
          followers_total: followersValue,
          new_followers: followsMap.get(day)?.gained ?? 0,
          lost_followers: followsMap.get(day)?.lost ?? 0,
          video_views: ins ? num(ins.views) : legacy ? legacy.views : 0,
          published_posts: publishedMap.get(day) ?? 0,
          failed_posts: failedMap.get(day) ?? 0,
        },
      }
    })
  }

  /**
   * Reconstruct the genuine per-day follower total for a set of calendar days
   * by walking backwards from the current live count using the per-day
   * follows_and_unfollows store. For each day D:
   *   followers[D] = currentFollowers − Σ(gained[after D] − lost[after D])
   * This converts the "how many gained/lost per day" series we have into an
   * absolute follower count series, reflecting real movement rather than
   * the sparse, polling-only snapshots.
   * Returns an empty map when the store has no data for the range.
   */
  private async reconstructDailyFollowerTotals(
    workspaceId: string,
    days: string[],
    asOf: Date
  ): Promise<Map<string, number>> {
    try {
      if (days.length === 0) return new Map()
      const currentFollowers = await this.currentFollowers(workspaceId)
      if (currentFollowers <= 0) return new Map()
      const ids = await this.activeAccountIds(workspaceId)
      if (ids.length === 0) return new Map()
      const asOfYmd = toUtcYmd(asOf)
      const fromYmd = days[0]
      const rows = (await AnalyticsDailyMetricModel.find({
        accountId: { $in: ids },
        metricGroup: 'follows_and_unfollows',
        date: { $gte: fromYmd, $lte: asOfYmd },
      })
        .select('date values')
        .lean()) as Array<{ date: string; values?: Record<string, number> }>
      if (rows.length === 0) return new Map()

      // Build a per-day net map (gained - lost) summed across accounts.
      const netByDay = new Map<string, number>()
      for (const r of rows) {
        const g = num(r.values?.gained)
        const l = num(r.values?.lost)
        netByDay.set(r.date, (netByDay.get(r.date) ?? 0) + g - l)
      }

      // Walk backwards: the count at asOf is currentFollowers; each earlier day
      // is current − cumulative-net-after-that-day.
      const sortedDays = [...new Set([...days, ...netByDay.keys()])].sort((a, b) => (a < b ? 1 : -1))
      let running = currentFollowers
      const result = new Map<string, number>()
      for (const d of sortedDays) {
        result.set(d, Math.max(0, Math.round(running)))
        const net = netByDay.get(d) ?? 0
        running -= net // subtract this day's net to get the count *before* that day's activity
      }
      return result
    } catch {
      return new Map()
    }
  }

  /**
   * Per-day analytics rows for the selected window, deduped so each day has a
   * single representative value: snapshot fields (reach, reachDays28, followers)
   * take the LAST value of the day (avoids double-counting multiple syncs), flow
   * fields (likes/comments/shares/views) are summed.
   */
  private async getDailyReachRows(query: RollupReadQuery): Promise<DailyReachRow[]> {
    const { startDate, endDate, platform } = this.resolve(query)
    const match: Record<string, unknown> = {
      workspaceId: String(query.workspaceId),
      date: { $gte: startDate, $lte: endDate },
    }
    if (platform) match.platform = platform
    // Scope to the active account(s) so a different/disconnected account's rows
    // (e.g. a 3-follower account synced once) don't pollute the series.
    const accountIds = await this.activeAccountIds(query.workspaceId)
    if (accountIds.length > 0) match.accountId = { $in: accountIds }

    try {
      const rows = (await AnalyticsModel.aggregate([
        { $match: match },
        { $sort: { date: 1 } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
            reachDay: { $last: '$reachDay' },
            reachWeek: { $last: '$reachWeek' },
            reachDays28: { $last: '$reachDays28' },
            reach: { $last: '$reach' },
            followers: { $last: '$followers' },
            likes: { $sum: '$likes' },
            comments: { $sum: '$comments' },
            shares: { $sum: '$shares' },
            views: { $sum: '$views' },
          },
        },
        { $sort: { _id: 1 } },
      ]).exec()) as Array<{
        _id: string
        reachDay?: number
        reachWeek?: number
        reachDays28?: number
        reach?: number
        followers?: number
        likes?: number
        comments?: number
        shares?: number
        views?: number
      }>

      return rows.map((r) => ({
        date: r._id,
        reachDay: num(r.reachDay),
        reachWeek: num(r.reachWeek),
        reachDays28: num(r.reachDays28),
        reach: num(r.reach),
        followers: num(r.followers),
        likes: num(r.likes),
        comments: num(r.comments),
        shares: num(r.shares),
        views: num(r.views),
      }))
    } catch {
      return []
    }
  }

  /**
   * Genuine followers GAINED and LOST for the window, summed across the
   * workspace's active Instagram account(s), from Instagram's
   * `follows_and_unfollows` insight (real API data, ~24-month retention).
   *
   * Served through the history read-through cache (Redis → MongoDB), which keeps
   * the expensive, rate-limited Meta fetch OFF the request path: a BullMQ worker
   * populates the durable store, and repeated / overlapping range queries read
   * the cache instead of calling Meta again (historical windows are immutable).
   *
   * Returns null when nothing is cached yet (caller falls back to the
   * snapshot-derived flow while the worker backfills). Never throws.
   */
  private async getFollowsAndUnfollows(
    workspaceId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{ gained: number; lost: number } | null> {
    try {
      const accounts = await socialAccountRepository.findActiveByWorkspace(workspaceId)
      const historyAccounts: HistoryAccount[] = []
      for (const acc of accounts) {
        if (acc.platform !== 'instagram' || !acc.accountId) continue
        const token = getAccessTokenFromAccount(acc)
        if (!token) continue
        historyAccounts.push({ accountId: String(acc.accountId), token })
      }
      if (historyAccounts.length === 0) return null

      const flow = await getFollowsRange(workspaceId, historyAccounts, startDate, endDate)
      if (!flow) return null
      return flow.gained > 0 || flow.lost > 0 ? flow : null
    } catch {
      return null
    }
  }

  /**
   * Build the (accountId, token) list for the workspace's active Instagram
   * accounts — shared by the history-store readers.
   */
  private async historyAccounts(workspaceId: string): Promise<HistoryAccount[]> {
    const out: HistoryAccount[] = []
    try {
      const accounts = await socialAccountRepository.findActiveByWorkspace(workspaceId)
      for (const acc of accounts) {
        if (acc.platform !== 'instagram' || !acc.accountId) continue
        const token = getAccessTokenFromAccount(acc)
        if (!token) continue
        out.push({ accountId: String(acc.accountId), token })
      }
    } catch {
      // ignore
    }
    return out
  }

  /**
   * Reconstruct the genuine follower TOTAL as of a past date:
   * `currentFollowers − Σ(net follows after that date)` from the per-day follows
   * store. Enables historical Followers / Growth Rate / Churn / Retention.
   * Returns null when the current count or the store isn't available.
   */
  private async reconstructFollowersAsOf(workspaceId: string, asOf: Date): Promise<number | null> {
    try {
      const current = await this.currentFollowers(workspaceId)
      if (current <= 0) return null
      const now = new Date()
      // Window ends at/near now → the current live count IS the value.
      if (asOf.getTime() >= now.getTime() - 2 * DAY_MS) return current

      const accounts = await this.historyAccounts(workspaceId)
      if (accounts.length === 0) return null

      // Net change strictly AFTER the window end (day after `asOf` → now).
      const from = new Date(asOf.getTime() + DAY_MS)
      const flow = await getFollowsRange(workspaceId, accounts, from, now)
      if (!flow) return null
      const netAfter = num(flow.gained) - num(flow.lost)
      const val = Math.round(current - netAfter)
      return val > 0 ? val : null
    } catch {
      return null
    }
  }

  /**
   * Genuine reach / impressions(views) / engagement (likes, comments, shares,
   * saves) / profile visits / website clicks summed across the workspace's
   * active Instagram account(s) for the window, from the per-day insights store
   * (Redis → MongoDB, ~24-month history). Returns null when not yet fully stored
   * (caller keeps the legacy recent-data value while the worker backfills).
   */
  private async getInsightsTotals(
    workspaceId: string,
    startDate: Date,
    endDate: Date
  ): Promise<Record<string, number> | null> {
    try {
      const accounts = await socialAccountRepository.findActiveByWorkspace(workspaceId)
      const historyAccounts: HistoryAccount[] = []
      for (const acc of accounts) {
        if (acc.platform !== 'instagram' || !acc.accountId) continue
        const token = getAccessTokenFromAccount(acc)
        if (!token) continue
        historyAccounts.push({ accountId: String(acc.accountId), token })
      }
      if (historyAccounts.length === 0) return null
      return await getInsightsRange(workspaceId, historyAccounts, startDate, endDate)
    } catch {
      return null
    }
  }

  /**
   * Per-day insights rows (reach / engagement / views) for the chart, summed
   * across the workspace's active Instagram account(s), from the durable store.
   * Covers any range (~24 months); empty when nothing is stored yet.
   */
  private async getInsightsDailyRows(
    workspaceId: string,
    startDate: Date,
    endDate: Date
  ): Promise<Array<{ date: string; values: Record<string, number> }>> {
    try {
      const ids = await this.activeAccountIds(workspaceId)
      if (ids.length === 0) return []
      return await getInsightsDaily(ids, startDate, endDate)
    } catch {
      return []
    }
  }
  private reachFieldFor(startDate: Date, endDate: Date): ReachField {
    const days = (endDate.getTime() - startDate.getTime()) / DAY_MS
    if (days <= 1.5) return 'reachDay'
    if (days <= 7.5) return 'reachWeek'
    if (days <= 31) return 'reachDays28'
    return 'reach'
  }

  /** Reach value for a day using the window-matched field, with sensible fallbacks. */
  private reachOf(row: DailyReachRow, field: ReachField): number {
    return row[field] || row.reachDays28 || row.reachWeek || row.reach || row.reachDay || 0
  }

  /** Latest reach value (window-matched field) from the series, or null. */
  private latestReach(rows: DailyReachRow[], field: ReachField): number | null {
    for (let i = rows.length - 1; i >= 0; i--) {
      const v = this.reachOf(rows[i], field)
      if (v > 0) return v
    }
    return null
  }

  /**
   * Genuine follower count as of a date: sum across the active account(s) of the
   * latest `InstagramFollowerSnapshot` reading on/before that date — the same
   * source the Home "Monthly Momentum" uses. Null when no reading exists.
   */
  private async followersAsOf(workspaceId: string, date: Date): Promise<number | null> {
    const ids = await this.activeAccountIds(workspaceId)
    if (ids.length === 0) return null
    let total = 0
    let any = false
    for (const id of ids) {
      try {
        const snap = (await InstagramFollowerSnapshotModel.findOne({
          instagramUserId: id,
          followerCount: { $gt: 0 },
          snapshotDate: { $lte: date },
        })
          .sort({ snapshotDate: -1 })
          .lean()) as { followerCount?: number } | null
        if (snap && num(snap.followerCount) > 0) {
          total += num(snap.followerCount)
          any = true
        }
      } catch {
        // ignore this account
      }
    }
    return any ? total : null
  }

  /**
   * Genuine daily follower totals within the window from `InstagramFollowerSnapshot`,
   * scoped to the active account(s), deduped to one reading per account per day
   * (max), zeros dropped, then summed across accounts. Sorted ascending by day.
   */
  private async getFollowerSnapshotDaily(
    workspaceId: string,
    startDate: Date,
    endDate: Date
  ): Promise<Array<{ date: string; followers: number }>> {
    const ids = await this.activeAccountIds(workspaceId)
    if (ids.length === 0) return []
    try {
      const rows = (await InstagramFollowerSnapshotModel.aggregate([
        {
          $match: {
            instagramUserId: { $in: ids },
            followerCount: { $gt: 0 },
            snapshotDate: { $gte: startDate, $lte: endDate },
          },
        },
        {
          $group: {
            _id: {
              day: { $dateToString: { format: '%Y-%m-%d', date: '$snapshotDate' } },
              acct: '$instagramUserId',
            },
            f: { $max: '$followerCount' },
          },
        },
        { $group: { _id: '$_id.day', followers: { $sum: '$f' } } },
        { $sort: { _id: 1 } },
      ]).exec()) as Array<{ _id: string; followers?: number }>
      return rows.map((r) => ({ date: r._id, followers: num(r.followers) }))
    } catch {
      return []
    }
  }

  /**
   * Instagram user ids of the workspace's ACTIVE accounts (e.g. the arpit.10
   * account), used to scope analytics queries so a disconnected / different
   * account's leftover rows (e.g. a 3-follower account) never pollute the
   * numbers. Empty array = don't filter (fall back to workspace scope).
   */
  private async activeAccountIds(workspaceId: string): Promise<string[]> {
    try {
      const accounts = await socialAccountRepository.findActiveByWorkspace(workspaceId)
      return accounts
        .filter((a) => a.platform === 'instagram' && a.accountId)
        .map((a) => String(a.accountId))
    } catch {
      return []
    }
  }

  /**
   * Live total follower count across the workspace's active Instagram accounts.
   * Priority: latest InstagramFollowerSnapshot (same source as Analytics Audience page)
   * → SocialAccount.followersCount (fallback when no snapshot exists).
   * This ensures the home dashboard and analytics page always show the same number.
   */
  private async currentFollowers(workspaceId: string): Promise<number> {
    try {
      const ids = await this.activeAccountIds(workspaceId)
      if (ids.length > 0) {
        // Try to get the latest snapshot for each account
        let total = 0
        let anySnapshot = false
        for (const id of ids) {
          try {
            const snap = await InstagramFollowerSnapshotModel.findOne({
              instagramUserId: id,
              followerCount: { $gt: 0 },
            })
              .sort({ snapshotDate: -1 })
              .lean() as { followerCount?: number } | null
            if (snap && num(snap.followerCount) > 0) {
              total += num(snap.followerCount)
              anySnapshot = true
            }
          } catch { /* skip this account */ }
        }
        if (anySnapshot) return total
      }
      // Fallback: SocialAccount.followersCount
      const accounts = await socialAccountRepository.findActiveByWorkspace(workspaceId)
      return accounts
        .filter((a) => a.platform === 'instagram')
        .reduce((sum, a) => sum + num(a.followersCount), 0)
    } catch {
      return 0
    }
  }

  /**
   * Followers gained / lost from a daily follower-total series (day-over-day
   * changes). Instagram's API doesn't expose the gross new-vs-unfollow split, so
   * this is the honest derivation from the real follower totals we capture; the
   * net (gained − lost) matches the Home page's monthly growth. Null if < 2.
   */
  private followerFlow(series: number[]): { gained: number; lost: number } | null {
    if (series.length < 2) return null
    let gained = 0
    let lost = 0
    for (let i = 1; i < series.length; i++) {
      const diff = series[i] - series[i - 1]
      if (diff > 0) gained += diff
      else lost += -diff
    }
    return { gained, lost }
  }

  /** Audience distribution by country from the active account's demographics
   * (stored on `SocialAccount.audienceCountry` by the sync pipeline). */
  async getAudienceByCountry(query: RollupReadQuery): Promise<DistributionSlice[]> {
    return this.audienceDemographicSlices(query, 'audienceCountry', 8)
  }

  /** Audience distribution by city/state. */
  async getAudienceByCity(query: RollupReadQuery): Promise<DistributionSlice[]> {
    return this.audienceDemographicSlices(query, 'audienceCity', 10)
  }

  /**
   * Audience by gender + age (Meta format: "F_18-24", "M_25-34", etc.).
   * Returns slices sorted by value descending, combined across accounts.
   */
  async getAudienceByGenderAge(query: RollupReadQuery): Promise<DistributionSlice[]> {
    return this.audienceDemographicSlices(query, 'audienceGenderAge', 16)
  }

  /** Audience active time (hours 0–23) — empty when Meta doesn't provide data. */
  async getAudienceActiveTime(query: RollupReadQuery): Promise<Record<string, number>> {
    try {
      const accounts = await socialAccountRepository.findActiveByWorkspace(query.workspaceId)
      const combined: Record<string, number> = {}
      for (const acc of accounts) {
        if (acc.platform !== 'instagram') continue
        const raw = (acc as unknown as Record<string, unknown>).audienceActiveTime
        if (!raw || typeof raw !== 'object') continue
        const obj: Record<string, number> = raw instanceof Map ? Object.fromEntries(raw) : (raw as Record<string, number>)
        for (const [k, v] of Object.entries(obj)) {
          if (typeof v === 'number' && v > 0) combined[k] = (combined[k] ?? 0) + v
        }
      }
      return combined
    } catch {
      return {}
    }
  }

  /** Shared helper: read a demographics Map field from the active SocialAccounts.
   * Also schedules a background refresh if demographics are stale (>24h old). */
  private async audienceDemographicSlices(
    query: RollupReadQuery,
    field: 'audienceCountry' | 'audienceCity' | 'audienceGenderAge',
    limit: number
  ): Promise<DistributionSlice[]> {
    // Primary: SocialAccount demographics (written by the sync pipeline).
    try {
      const accounts = await socialAccountRepository.findActiveByWorkspace(query.workspaceId)
      const combined: Record<string, number> = {}
      for (const acc of accounts) {
        if (acc.platform !== 'instagram') continue
        const raw = (acc as unknown as Record<string, unknown>)[field]
        if (!raw || typeof raw !== 'object') continue
        const obj: Record<string, number> = raw instanceof Map
          ? Object.fromEntries(raw)
          : (raw as Record<string, number>)
        for (const [k, v] of Object.entries(obj)) {
          if (typeof v === 'number' && v > 0) combined[k] = (combined[k] ?? 0) + v
        }
        // Background refresh if demographics are stale (>24h) — fire-and-forget.
        const lastFetched = (acc as unknown as { demographicsLastFetched?: Date }).demographicsLastFetched
        const stale = !lastFetched || Date.now() - lastFetched.getTime() > 24 * 60 * 60 * 1000
        if (stale && field === 'audienceCountry') {
          // Only trigger once (on country, so the three demographic field reads don't triple-trigger).
          import('../../../services/SocialAccountService').then(async ({ SocialAccountService }) => {
            const svc = new SocialAccountService()
            svc.syncAccount(String((acc as unknown as { _id: unknown })._id), { metricsType: 'reach' }).catch(() => {})
          }).catch(() => {})
        }
      }
      if (Object.keys(combined).length > 0) {
        return Object.entries(combined)
          .map(([label, value]) => ({ label, value: num(value) }))
          .filter((s) => s.value > 0)
          .sort((a, b) => b.value - a.value)
          .slice(0, limit)
      }
    } catch {
      // fall through to legacy
    }

    // Fallback: Analytics collection (older sync path, country only).
    if (field === 'audienceCountry') {
      const latest = await analyticsService.getLatestAnalytics(query.workspaceId)
      const byCountry = toRecord((latest as { audienceCountry?: unknown } | null)?.audienceCountry)
      return Object.entries(byCountry)
        .map(([label, value]) => ({ label, value: num(value) }))
        .filter((s) => s.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, limit)
    }
    return []
  }

  /** Top-performing published content by reach + views (with full metrics for cards). */
  async getTopContent(query: RollupReadQuery): Promise<TopItem[]> {
    const rows = (await ContentModel.find({ workspaceId: query.workspaceId, status: 'published' })
      .sort({ publishedAt: -1 })
      .limit(50)
      .lean()) as unknown as ContentRow[]

    return rows
      .map((r) => {
        const m = r.metrics ?? {}
        const likes = num(m.likes)
        const comments = num(m.comments)
        const shares = num(m.shares)
        const saves = num(m.saves)
        const reach = num(m.reach)
        const views = num(m.views)
        const engagements = likes + comments + shares + saves

        // Thumbnail: prefer thumbnail_url (videos), then media_url (images)
        const mediaType = r.contentData?.media_type ?? 'IMAGE'
        const thumbnailUrl = r.contentData?.thumbnail_url || r.contentData?.media_url || undefined

        // Primary sort value: views (for videos) > reach > engagements
        const sortScore = views > 0 ? views : reach > 0 ? reach : engagements

        return {
          id: String(r._id),
          label: r.title || 'Untitled post',
          value: reach > 0 ? reach : views, // primary display metric
          secondary: `${engagements.toLocaleString()} engagements`,
          thumbnailUrl,
          mediaType,
          permalink: r.contentData?.permalink,
          publishedAt: r.publishedAt?.toISOString(),
          metrics: {
            reach,
            views,
            likes,
            comments,
            shares,
            saves,
            engagements,
          },
          _sort: sortScore + engagements,
        }
      })
      .sort((a, b) => b._sort - a._sort)
      .slice(0, 10)
      .map(({ _sort, ...item }) => item)
  }

  /**
   * Per-day new/lost followers from the follows_and_unfollows store for the daily series.
   */
  private async getFollowsPerDay(
    workspaceId: string,
    startDate: Date,
    endDate: Date
  ): Promise<Array<{ date: string; gained: number; lost: number }>> {
    try {
      const ids = await this.activeAccountIds(workspaceId)
      if (ids.length === 0) return []
      const fromYmd = toUtcYmd(startDate)
      const toYmd = toUtcYmd(clampToNow(endDate))
      const rows = (await AnalyticsDailyMetricModel.find({
        accountId: { $in: ids },
        metricGroup: 'follows_and_unfollows',
        date: { $gte: fromYmd, $lte: toYmd },
      })
        .select('date values')
        .lean()) as Array<{ date: string; values?: Record<string, number> }>
      const byDay = new Map<string, { gained: number; lost: number }>()
      for (const r of rows) {
        const existing = byDay.get(r.date) ?? { gained: 0, lost: 0 }
        existing.gained += num(r.values?.gained)
        existing.lost += num(r.values?.lost)
        byDay.set(r.date, existing)
      }
      return [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([date, v]) => ({ date, ...v }))
    } catch {
      return []
    }
  }

  /**
   * Per-day published post counts for the chart (publishing dashboard).
   * Groups `ContentModel` published posts by `publishedAt` day.
   */
  private async getPublishedPostsByDay(
    workspaceId: string,
    startDate: Date,
    endDate: Date
  ): Promise<Array<{ date: string; count: number }>> {
    return this.getPostsByStatusPerDay(workspaceId, 'published', startDate, endDate)
  }

  /**
   * Per-day post counts by status (published / failed) for the chart.
   */
  private async getPostsByStatusPerDay(
    workspaceId: string,
    status: string,
    startDate: Date,
    endDate: Date
  ): Promise<Array<{ date: string; count: number }>> {
    try {
      const rows = (await ContentModel.aggregate([
        {
          $match: {
            workspaceId,
            status,
            publishedAt: { $gte: startDate, $lte: endDate },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$publishedAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]).exec()) as Array<{ _id: string; count: number }>
      return rows.map((r) => ({ date: r._id, count: r.count }))
    } catch {
      return []
    }
  }

  /**
   * Count content documents by status within the selected window only.
   * Returns 0 when no posts match — does NOT fall back to all-time, so
   * "Published Posts" correctly shows 0 when nothing was published in the range.
   */
  private async countPostsByStatus(
    workspaceId: string,
    status: string,
    startDate: Date,
    endDate: Date,
    platform?: string
  ): Promise<number> {
    try {
      const match: Record<string, unknown> = {
        workspaceId,
        status,
        publishedAt: { $gte: startDate, $lte: endDate },
      }
      if (platform) match.platform = platform
      return await ContentModel.countDocuments(match).exec()
    } catch {
      return 0
    }
  }

  /**
   * Aggregate real engagement + reach + impressions across published content in
   * the window (falling back to all-time when nothing matches the window), plus
   * the published count. Engagement is not stored on the daily analytics
   * snapshot, so Content is the source of truth for interactions.
   */
  private async aggregatePublishedContent(
    workspaceId: string,
    startDate: Date,
    endDate: Date,
    platform?: string
  ): Promise<{
    count: number
    likes: number
    comments: number
    shares: number
    saves: number
    reach: number
    impressions: number
    views: number
  }> {
    const empty = { count: 0, likes: 0, comments: 0, shares: 0, saves: 0, reach: 0, impressions: 0, views: 0 }
    const group = {
      _id: null,
      count: { $sum: 1 },
      likes: { $sum: '$metrics.likes' },
      comments: { $sum: '$metrics.comments' },
      shares: { $sum: '$metrics.shares' },
      saves: { $sum: '$metrics.saves' },
      reach: { $sum: '$metrics.reach' },
      impressions: { $sum: '$metrics.impressions' },
      // Per-post video/reel play counts (Meta v18+ 'views' metric, stored by the sync pipeline).
      views: { $sum: '$metrics.views' },
    }
    try {
      const run = async (match: Record<string, unknown>) => {
        const result = await ContentModel.aggregate([{ $match: match }, { $group: group }]).exec()
        return result?.[0] as (typeof empty & { _id: unknown }) | undefined
      }

      // Strict window query — no all-time fallback. If no posts were published in
      // the selected range, count and engagement metrics correctly return 0.
      // The all-time fallback was masking real zeroes (e.g. "Yesterday" with no
      // posts published showed 19 instead of 0).
      const baseMatch: Record<string, unknown> = {
        workspaceId,
        status: 'published',
        publishedAt: { $gte: startDate, $lte: endDate },
      }
      // When platform is specified, filter to only that platform's content.
      // When undefined (All Platforms), include all connected platform content.
      if (platform) {
        baseMatch.platform = platform
      }
      const row = await run(baseMatch)
      if (!row) return empty

      return {
        count: num(row.count),
        likes: num(row.likes),
        comments: num(row.comments),
        shares: num(row.shares),
        saves: num(row.saves),
        reach: num(row.reach),
        impressions: num(row.impressions),
        views: num((row as any).views),
      }
    } catch {
      return empty
    }
  }
}

export const legacyRollupReadStore = new LegacyRollupReadStore()
