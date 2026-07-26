/**
 * Facebook Page Insights history store — durable per-day read-through cache
 * that mirrors `insightsHistory.ts` for Instagram, giving Facebook the same
 * "store once, serve forever" architecture.
 *
 * Design:
 *  - One Meta call per day fetches ALL page-level insights for that day.
 *  - Each completed day is immutable once stored — never re-fetched.
 *  - Any range query is answered by summing stored days: Redis → MongoDB.
 *  - BullMQ worker is the sole Meta writer (off the request path).
 *  - On OAuth connect, 4 phased jobs cover the full 24-month history.
 *
 * Metrics stored per day (all confirmed valid via live API probe):
 *   page_posts_impressions_organic  → impressions_total
 *   page_post_engagements           → total_engagements
 *   page_views_total                → reach_total (page visits proxy) + profile_visits
 *   page_actions_post_reactions_like_total → likes
 *   page_video_views                → video_views + reach_total fallback
 *   page_follows                    → followers_total (snapshot — latest per chunk)
 *   page_daily_follows              → new_followers
 *   page_daily_unfollows_unique     → lost_followers
 *   page_actions_post_reactions_total → facebook_reactions
 */

import AnalyticsDailyMetricModel from '../../../models/Analytics/AnalyticsDailyMetric'
import { getRedisClient } from '../../../lib/redis'
import { socialAccountRepository } from '../../../repositories/SocialAccountRepository'
import { getAccessTokenFromAccount } from '../../../storage/converters'
import { histLog } from '../../analytics/history/historyDebugLog'
import {
  clampToNow,
  enumerateDays,
  isFresh,
  isImmutableWindow,
  missingDays,
  toUtcYmd,
  todayUtcYmd,
  DAY,
} from '../../analytics/history/windowKeys'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const METRIC_GROUP = 'facebook_insights'
const PLATFORM = 'facebook'
const MUTABLE_TTL_MS = 30 * 60 * 1000        // 30 min — today's value re-fetched at most this often
const REDIS_TTL_IMMUTABLE_S = 24 * 60 * 60    // 24h — past days are immutable
const REDIS_TTL_MUTABLE_S = 5 * 60            // 5 min — today's value
const PREWARM_DAYS = 730                       // 24 months (Meta's retention limit)
const LEADING_GAP_TOLERANCE_DAYS = 3
const FB_GRAPH_BASE = 'https://graph.facebook.com'
const FB_API_VERSION = 'v19.0'

// ---------------------------------------------------------------------------
// Metric keys stored per day
// ---------------------------------------------------------------------------

export const FB_INSIGHTS_KEYS = [
  'page_posts_impressions_organic',
  'page_post_engagements',
  'page_views_total',
  'page_actions_post_reactions_like_total',
  'page_video_views',
  'page_follows',                   // snapshot — latest value per day
  'page_daily_follows',
  'page_daily_unfollows_unique',
  'page_actions_post_reactions_total',
] as const

/** Metrics that are cumulative snapshots (use latest value, not sum). */
const SNAPSHOT_KEYS = new Set<string>(['page_follows'])

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DailyRow {
  date: string
  values?: Record<string, number>
  fetchedAt?: Date
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

function redisIfReady() {
  try {
    const client = getRedisClient()
    return client && client.status === 'ready' ? client : null
  } catch {
    return null
  }
}

function fbInsightsRedisKey(workspaceId: string, accountId: string, fromYmd: string, toYmd: string): string {
  return `analytics:fb_insights:${workspaceId}:${accountId}:${fromYmd}:${toYmd}`
}

function prevDayYmd(now: Date): string {
  return toUtcYmd(new Date(now.getTime() - DAY))
}

// ---------------------------------------------------------------------------
// Token helper (mirrors getFreshTokenForAccount from followsHistory)
// ---------------------------------------------------------------------------

export async function getFreshFacebookToken(accountId: string): Promise<string | null> {
  try {
    const { SocialAccountModel } = await import('../../../models/Social/SocialAccount')
    const acc = await SocialAccountModel.findOne({
      accountId,
      platform: 'facebook',
      isActive: true,
      connectionStatus: 'ACTIVE',
    }).lean()
    if (!acc) return null
    return getAccessTokenFromAccount(acc)
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Fetch a single day's Facebook Page Insights
// ---------------------------------------------------------------------------

/**
 * Fetch all trackable Page Insight metrics for a single day (since=day, until=day+1).
 * Returns a flat record of metric_name → value. Missing metrics return 0.
 * Facebook's `period=day` with `since`/`until` gives exactly one day's data.
 */
async function fetchOneDayInsights(
  pageId: string,
  token: string,
  dayYmd: string
): Promise<Record<string, number>> {
  const since = Math.floor(Date.parse(`${dayYmd}T00:00:00.000Z`) / 1000)
  const until = since + 86400 // next day

  const primary = [
    'page_posts_impressions_organic',
    'page_post_engagements',
    'page_views_total',
  ].join(',')

  const secondary = [
    'page_actions_post_reactions_like_total',
    'page_video_views',
    'page_follows',
    'page_daily_follows',
    'page_daily_unfollows_unique',
    'page_actions_post_reactions_total',
  ].join(',')

  const result: Record<string, number> = {}

  const fetchBatch = async (metrics: string): Promise<void> => {
    try {
      const url = `${FB_GRAPH_BASE}/${FB_API_VERSION}/${pageId}/insights?metric=${metrics}&period=day&since=${since}&until=${until}&access_token=${token}`
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
      if (!res.ok) return
      const json = await res.json() as {
        data?: Array<{
          name: string
          values: Array<{ value: number | Record<string, number>; end_time: string }>
        }>
      }
      for (const metric of json.data ?? []) {
        const vals = metric.values ?? []
        if (vals.length === 0) continue
        // Coerce: reactions total returns an object {like:N, love:M, ...}, sum it
        const coerce = (val: unknown): number => {
          if (typeof val === 'number' && Number.isFinite(val)) return val
          if (val && typeof val === 'object') {
            return Object.values(val as Record<string, number>)
              .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
              .reduce((s, v) => s + v, 0)
          }
          return 0
        }
        if (SNAPSHOT_KEYS.has(metric.name)) {
          // Snapshot: take the last value
          result[metric.name] = coerce(vals[vals.length - 1]?.value)
        } else {
          // Flow: sum all values (should be just 1 for day period)
          result[metric.name] = vals.reduce((s, v) => s + coerce(v.value), 0)
        }
      }
    } catch {
      // non-fatal — partial data is better than nothing
    }
  }

  await fetchBatch(primary)
  await fetchBatch(secondary)
  return result
}

// ---------------------------------------------------------------------------
// Fetch and persist a date range (used by the BullMQ worker)
// ---------------------------------------------------------------------------

/**
 * Fetch per-day Facebook Page Insights for a window and upsert into
 * `AnalyticsDailyMetricModel`. Skips immutable days already stored.
 * Called by the BullMQ `analytics-history-backfill` worker.
 */
export async function fetchAndPersistFacebookInsightsDaily(
  workspaceId: string,
  accountId: string,
  token: string,
  from: Date,
  to: Date
): Promise<void> {
  const now = new Date()
  const toC = clampToNow(to, now)
  const fromYmd = toUtcYmd(from)
  const toYmd = toUtcYmd(toC)
  if (fromYmd > toYmd) return

  const todayY = todayUtcYmd(now)

  // Load existing immutable days to skip
  const existing = (await AnalyticsDailyMetricModel.find({
    accountId,
    metricGroup: METRIC_GROUP,
    date: { $gte: fromYmd, $lte: toYmd },
  })
    .select('date immutable')
    .lean()) as Array<{ date: string; immutable?: boolean }>

  const skip = new Set<string>()
  for (const r of existing) {
    if (r.immutable && r.date < todayY) skip.add(r.date)
  }

  const allDays = enumerateDays(fromYmd, toYmd)
  const daysToFetch = allDays.filter((d) => !skip.has(d))

  histLog('FB_INSIGHTS_BACKFILL_START', {
    accountId, workspaceId, fromYmd, toYmd,
    totalDays: allDays.length, skipped: skip.size, toFetch: daysToFetch.length,
  })

  // Fetch sequentially with a small delay to respect rate limits
  for (const dayYmd of daysToFetch) {
    try {
      const values = await fetchOneDayInsights(accountId, token, dayYmd)

      await AnalyticsDailyMetricModel.updateOne(
        { accountId, metricGroup: METRIC_GROUP, date: dayYmd },
        {
          $set: {
            workspaceId,
            platform: PLATFORM,
            values,
            immutable: dayYmd < todayY,
            fetchedAt: new Date(),
          },
        },
        { upsert: true }
      ).exec()

      // Small pause between days to avoid Meta rate limits (50ms)
      await new Promise((r) => setTimeout(r, 50))
    } catch {
      // Skip this day — will be retried on next backfill
    }
  }

  histLog('FB_INSIGHTS_BACKFILL_DONE', {
    accountId, workspaceId, fromYmd, toYmd,
    fetched: daysToFetch.length, skipped: skip.size,
  })
}

// ---------------------------------------------------------------------------
// Read path — Redis → MongoDB, enqueue on miss
// ---------------------------------------------------------------------------

/**
 * Read summed Facebook Page Insights for a window from the durable per-day store.
 * Serves Redis → MongoDB; enqueues BullMQ backfill for missing/stale days.
 * Returns null when coverage is incomplete (caller falls back to live API call
 * while backfill runs in the background).
 * Never throws.
 */
export async function getFacebookInsightsRange(
  workspaceId: string,
  accountId: string,
  token: string,
  from: Date,
  to: Date
): Promise<Record<string, number> | null> {
  try {
    const now = new Date()
    const toC = clampToNow(to, now)
    const fromYmd = toUtcYmd(from)
    const toYmd = toUtcYmd(toC)
    if (fromYmd > toYmd) return {}

    const key = fbInsightsRedisKey(workspaceId, accountId, fromYmd, toYmd)
    const client = redisIfReady()

    // 1. Redis fast path
    if (client) {
      try {
        const hit = await client.get(key)
        if (hit) return JSON.parse(hit) as Record<string, number>
      } catch { /* fall through */ }
    }

    const todayY = todayUtcYmd(now)
    const includesToday = toYmd >= todayY
    const lastImmutable = toYmd < todayY ? toYmd : prevDayYmd(now)
    const requiredImmutable = enumerateDays(fromYmd, lastImmutable)

    // 2. Load stored days from MongoDB
    let rows = (await AnalyticsDailyMetricModel.find({
      accountId,
      metricGroup: METRIC_GROUP,
      date: { $gte: fromYmd, $lte: toYmd },
    })
      .select('date values fetchedAt')
      .lean()) as DailyRow[]

    const evaluate = (list: DailyRow[]) => {
      const present = new Set(list.map((r) => r.date))
      // Sum flow metrics, take latest for snapshots
      const sums: Record<string, number> = {}
      for (const k of FB_INSIGHTS_KEYS) sums[k] = 0
      let snapshotLatestDate = ''
      let snapshotLatest: Record<string, number> = {}

      for (const r of list) {
        for (const k of FB_INSIGHTS_KEYS) {
          if (SNAPSHOT_KEYS.has(k)) {
            // Keep most recent day's snapshot
            if (r.date > snapshotLatestDate) {
              snapshotLatestDate = r.date
              snapshotLatest[k] = num(r.values?.[k])
            }
          } else {
            sums[k] += num(r.values?.[k])
          }
        }
      }
      // Merge snapshots over sums
      for (const k of SNAPSHOT_KEYS) {
        if (snapshotLatestDate) sums[k] = snapshotLatest[k] ?? 0
      }

      let interiorGaps = missingDays(requiredImmutable, present)
      let leadingGap = 0
      if (present.size > 0) {
        const firstStored = [...present].sort()[0]
        leadingGap = requiredImmutable.filter((d) => d < firstStored).length
        interiorGaps = missingDays(requiredImmutable.filter((d) => d >= firstStored), present)
      }
      const todayRow = list.find((r) => r.date === todayY)
      const todayStale = includesToday && (!todayRow || !isFresh(todayRow.fetchedAt ?? new Date(0), MUTABLE_TTL_MS, now))
      const covered =
        interiorGaps.length === 0 &&
        leadingGap <= LEADING_GAP_TOLERANCE_DAYS &&
        (!includesToday || present.has(todayY))

      return { sums, gaps: interiorGaps, todayStale, covered }
    }

    let evalResult = evaluate(rows)

    // 3. Enqueue backfill when days are missing/stale
    let inlineMetaFetch = false
    if (evalResult.gaps.length > 0 || evalResult.todayStale) {
      const prewarmFrom = new Date(now.getTime() - PREWARM_DAYS * DAY)
      try {
        const { AnalyticsHistoryQueueManager } = await import('../../../queues/analyticsHistoryQueue')
        const enqueued = await AnalyticsHistoryQueueManager.enqueueInsights({
          kind: 'facebook_insights' as any,
          workspaceId,
          accountId,
          token,
          fromIso: prewarmFrom.toISOString(),
          toIso: now.toISOString(),
        })

        if (!enqueued) {
          // Inline fallback when BullMQ/Redis unavailable
          inlineMetaFetch = true
          await fetchAndPersistFacebookInsightsDaily(workspaceId, accountId, token, from, toC)
          rows = (await AnalyticsDailyMetricModel.find({
            accountId,
            metricGroup: METRIC_GROUP,
            date: { $gte: fromYmd, $lte: toYmd },
          })
            .select('date values fetchedAt')
            .lean()) as DailyRow[]
          evalResult = evaluate(rows)
        }
      } catch { /* non-fatal */ }
    }

    // 4. Return null when not fully covered (caller uses live API as fallback)
    if (!evalResult.covered) return null

    // 5. Cache in Redis and return
    const totals = evalResult.sums
    if (client) {
      try {
        const ttl = isImmutableWindow(toYmd, now) ? REDIS_TTL_IMMUTABLE_S : REDIS_TTL_MUTABLE_S
        await client.set(key, JSON.stringify(totals), 'EX', ttl)
      } catch { /* best-effort */ }
    }

    return totals
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Prewarm on OAuth connect — 4 phases × 6 months = 24 months
// ---------------------------------------------------------------------------

/**
 * Enqueue the full 24-month Facebook Page Insights backfill in 4 phased jobs,
 * called from the Facebook OAuth callback right after account records are saved.
 *
 * Phase strategy (rate-limit-safe):
 *   Phase 0 (immediate):   most recent 6 months  → ~180 days
 *   Phase 1 (+1 hour):     months 7–12           → ~180 days
 *   Phase 2 (+2 hours):    months 13–18          → ~180 days
 *   Phase 3 (+3 hours):    months 19–24          → ~180 days
 *
 * Workers skip immutable days already stored, so reconnects are essentially free.
 * Fire-and-forget; never throws.
 */
export async function prewarmFacebookInsightsForWorkspace(workspaceId: string): Promise<void> {
  try {
    const accounts = await socialAccountRepository.findActiveByWorkspace(workspaceId)
    const fbAccounts = accounts.filter(
      (a) => a.platform === 'facebook' && a.accountId &&
             (a as any).connectionStatus !== 'REQUIRES_RECONNECT' &&
             (a as any).connectionStatus !== 'DISCONNECTED'
    )

    if (fbAccounts.length === 0) return

    const { AnalyticsHistoryQueueManager } = await import('../../../queues/analyticsHistoryQueue')
    const now = new Date()
    const MONTH_MS = 30 * DAY
    const HOUR_MS = 60 * 60 * 1000

    const phases = [
      { fromMs: now.getTime() - 6 * MONTH_MS,  toMs: now.getTime(),               delayMs: 0 },
      { fromMs: now.getTime() - 12 * MONTH_MS, toMs: now.getTime() - 6 * MONTH_MS,  delayMs: 1 * HOUR_MS },
      { fromMs: now.getTime() - 18 * MONTH_MS, toMs: now.getTime() - 12 * MONTH_MS, delayMs: 2 * HOUR_MS },
      { fromMs: now.getTime() - 24 * MONTH_MS, toMs: now.getTime() - 18 * MONTH_MS, delayMs: 3 * HOUR_MS },
    ]

    for (const acc of fbAccounts) {
      const token = getAccessTokenFromAccount(acc)
      if (!token) continue
      const accountId = String(acc.accountId)

      for (let phase = 0; phase < phases.length; phase++) {
        const { fromMs, toMs, delayMs } = phases[phase]
        await AnalyticsHistoryQueueManager.enqueueInsights({
          kind: 'facebook_insights' as any,
          workspaceId,
          accountId,
          token,
          fromIso: new Date(fromMs).toISOString(),
          toIso: new Date(toMs).toISOString(),
        }, delayMs)

        histLog('FB_PREWARM_ENQUEUE', {
          workspaceId, accountId, phase,
          fromYmd: new Date(fromMs).toISOString().slice(0, 10),
          toYmd: new Date(toMs).toISOString().slice(0, 10),
          delayMinutes: Math.round(delayMs / 60000),
        })
      }
    }
  } catch (e) {
    histLog('FB_PREWARM_ERROR', { workspaceId, error: (e as Error).message })
  }
}
