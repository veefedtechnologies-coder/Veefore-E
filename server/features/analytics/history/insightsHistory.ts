/**
 * Insights history store — the per-day durable read-through cache for the full
 * analytics KPI family (reach, impressions(views), likes, comments, shares,
 * saves, profile_views, website_clicks), mirroring the followers store.
 *
 * One Meta call per day returns ALL these metrics (`metric_type=total_value`),
 * verified live. Each completed day is immutable and stored once, so ANY range
 * or sub-range is answered by summing stored days — served from Redis → MongoDB,
 * never re-hitting Meta. The BullMQ worker is the sole Meta writer.
 */

import AnalyticsDailyMetricModel from '../../../models/Analytics/AnalyticsDailyMetric'
import { InstagramApiService } from '../../../services/instagramApi'
import { getRedisClient } from '../../../lib/redis'
import { histLog } from './historyDebugLog'
import {
  clampToNow,
  enumerateDays,
  isFresh,
  isImmutableWindow,
  missingDays,
  toUtcYmd,
  todayUtcYmd,
  DAY,
} from './windowKeys'
import type { HistoryAccount } from './followsHistory'

const METRIC_GROUP = 'insights'
const PLATFORM = 'instagram'
const MUTABLE_TTL_MS = 30 * 60 * 1000
const REDIS_TTL_IMMUTABLE_S = 24 * 60 * 60
const REDIS_TTL_MUTABLE_S = 5 * 60
const PREWARM_DAYS = 730
/** Tolerate a tiny leading gap at the very edge of Meta's retention (matches
 * followsHistory) so comparison windows reaching ~730 days back still resolve. */
const LEADING_GAP_TOLERANCE_DAYS = 3

/** Metric keys stored per day (match InstagramApiService.getDailyInsights). */
export const INSIGHTS_KEYS = [
  'likes',
  'comments',
  'shares',
  'saves',
  'profile_views',
  'website_clicks',
  'views',
  'reach',
] as const

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

function insightsRedisKey(workspaceId: string, ids: string[], fromYmd: string, toYmd: string): string {
  return `analytics:insights:${workspaceId}:${[...ids].sort().join(',')}:${fromYmd}:${toYmd}`
}

function prevDayYmd(now: Date): string {
  return toUtcYmd(new Date(now.getTime() - DAY))
}

/**
 * Fetch per-day insights for a window from Meta and upsert each day (only gaps;
 * immutable stored days are skipped). Runs in the BullMQ worker, off the request
 * path.
 */
export async function fetchAndPersistInsightsDaily(
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
  const existing = (await AnalyticsDailyMetricModel.find({
    accountId,
    metricGroup: METRIC_GROUP,
    date: { $gte: fromYmd, $lte: toYmd },
  })
    .select('date immutable')
    .lean()) as Array<{ date: string; immutable?: boolean }>

  const skip = new Set<string>()
  for (const r of existing) if (r.immutable && r.date < todayY) skip.add(r.date)

  const totalDays = enumerateDays(fromYmd, toYmd).length
  histLog('INSIGHTS_BACKFILL_START', {
    accountId,
    workspaceId,
    fromYmd,
    toYmd,
    totalDaysInWindow: totalDays,
    alreadyStoredImmutable: skip.size,
    willFetchApprox: Math.max(0, totalDays - skip.size),
    reusedFromDb: skip.size > 0,
  })

  const days = await InstagramApiService.getDailyInsights(accountId, token, from, toC, skip)

  await Promise.all(
    days.map((d) =>
      AnalyticsDailyMetricModel.updateOne(
        { accountId, metricGroup: METRIC_GROUP, date: d.date },
        {
          $set: {
            workspaceId,
            platform: PLATFORM,
            values: d.values,
            immutable: d.date < todayY,
            fetchedAt: now,
          },
        },
        { upsert: true }
      ).exec()
    )
  )

  histLog('INSIGHTS_BACKFILL_DONE', {
    accountId,
    workspaceId,
    fromYmd,
    toYmd,
    daysFetchedFromMeta: days.length,
    daysSkippedFromDb: skip.size,
  })
}

/**
 * Read summed insights for a window across accounts from the per-day store.
 * Serves Redis → MongoDB; enqueues a BullMQ backfill for missing/stale days.
 * Returns the summed metric map only when EVERY day is covered (never a partial),
 * else `null` so the caller keeps its legacy value while the worker backfills.
 * Never throws.
 */
export async function getInsightsRange(
  workspaceId: string,
  accounts: HistoryAccount[],
  from: Date,
  to: Date
): Promise<Record<string, number> | null> {
  try {
    if (accounts.length === 0) return null
    const now = new Date()
    const toC = clampToNow(to, now)
    const fromYmd = toUtcYmd(from)
    const toYmd = toUtcYmd(toC)
    if (fromYmd > toYmd) return {}

    const ids = accounts.map((a) => a.accountId)
    const key = insightsRedisKey(workspaceId, ids, fromYmd, toYmd)

    const client = redisIfReady()
    if (client) {
      try {
        const hit = await client.get(key)
        if (hit) {
          histLog('INSIGHTS_READ_REDIS_HIT', { workspaceId, ids, fromYmd, toYmd, source: 'REDIS (no Meta call)' })
          return JSON.parse(hit) as Record<string, number>
        }
      } catch {
        // fall through
      }
    }

    const todayY = todayUtcYmd(now)
    const includesToday = toYmd >= todayY
    const lastImmutable = toYmd < todayY ? toYmd : prevDayYmd(now)
    const requiredImmutable = enumerateDays(fromYmd, lastImmutable)

    const { AnalyticsHistoryQueueManager } = await import('../../../queues/analyticsHistoryQueue')

    const totals: Record<string, number> = {}
    for (const k of INSIGHTS_KEYS) totals[k] = 0
    let allCovered = true
    let backgroundBackfillEnqueued = false
    let inlineMetaFetch = false

    for (const acc of accounts) {
      let rows = (await AnalyticsDailyMetricModel.find({
        accountId: acc.accountId,
        metricGroup: METRIC_GROUP,
        date: { $gte: fromYmd, $lte: toYmd },
      })
        .select('date values fetchedAt')
        .lean()) as DailyRow[]

      const evaluate = (list: DailyRow[]) => {
        const present = new Set(list.map((r) => r.date))
        const sums: Record<string, number> = {}
        for (const k of INSIGHTS_KEYS) sums[k] = 0
        for (const r of list) for (const k of INSIGHTS_KEYS) sums[k] += num(r.values?.[k])
        let interiorGaps = missingDays(requiredImmutable, present)
        let leadingGap = 0
        if (present.size > 0) {
          const firstStored = [...present].sort()[0]
          leadingGap = requiredImmutable.filter((d) => d < firstStored).length
          interiorGaps = missingDays(
            requiredImmutable.filter((d) => d >= firstStored),
            present
          )
        }
        const todayRow = list.find((r) => r.date === todayY)
        const todayStale =
          includesToday && (!todayRow || !isFresh(todayRow.fetchedAt ?? new Date(0), MUTABLE_TTL_MS, now))
        const covered =
          interiorGaps.length === 0 &&
          leadingGap <= LEADING_GAP_TOLERANCE_DAYS &&
          (!includesToday || present.has(todayY))
        return { sums, gaps: interiorGaps, todayStale, covered }
      }

      let evalResult = evaluate(rows)

      histLog('INSIGHTS_READ_DB_COVERAGE', {
        workspaceId,
        accountId: acc.accountId,
        fromYmd,
        toYmd,
        storedDays: rows.length,
        requiredDays: requiredImmutable.length,
        missingDays: evalResult.gaps.length,
        covered: evalResult.covered,
        servedFrom: evalResult.covered ? 'DB (no Meta call)' : 'fallback (backfill enqueued)',
      })

      if (evalResult.gaps.length > 0 || evalResult.todayStale) {
        const prewarmFrom = new Date(now.getTime() - PREWARM_DAYS * DAY)
        const enqueued = await AnalyticsHistoryQueueManager.enqueueInsights({
          kind: 'insights',
          workspaceId,
          accountId: acc.accountId,
          token: acc.token,
          fromIso: prewarmFrom.toISOString(),
          toIso: now.toISOString(),
        })
        if (enqueued) backgroundBackfillEnqueued = true
        if (!enqueued) {
          try {
            inlineMetaFetch = true
            await fetchAndPersistInsightsDaily(workspaceId, acc.accountId, acc.token, from, toC)
            rows = (await AnalyticsDailyMetricModel.find({
              accountId: acc.accountId,
              metricGroup: METRIC_GROUP,
              date: { $gte: fromYmd, $lte: toYmd },
            })
              .select('date values fetchedAt')
              .lean()) as DailyRow[]
            evalResult = evaluate(rows)
          } catch {
            // leave uncovered
          }
        }
      }

      if (evalResult.covered) {
        for (const k of INSIGHTS_KEYS) totals[k] += evalResult.sums[k]
      } else {
        allCovered = false
      }
    }

    const rangeDays = requiredImmutable.length + (includesToday ? 1 : 0)
    if (!allCovered) {
      histLog('INSIGHTS_READ_RESULT', {
        workspaceId,
        ids,
        fromYmd,
        toYmd,
        rangeDays,
        source: 'FALLBACK (legacy/recent data) — background backfill running',
        servedFromDb: false,
        metaCalledThisRequest: inlineMetaFetch,
        backgroundBackfillEnqueued,
      })
      return null
    }

    if (client) {
      try {
        const ttl = isImmutableWindow(toYmd, now) ? REDIS_TTL_IMMUTABLE_S : REDIS_TTL_MUTABLE_S
        await client.set(key, JSON.stringify(totals), 'EX', ttl)
      } catch {
        // best-effort
      }
    }

    histLog('INSIGHTS_READ_RESULT', {
      workspaceId,
      ids,
      fromYmd,
      toYmd,
      rangeDays,
      reach: totals.reach,
      views: totals.views,
      engagements: totals.likes + totals.comments + totals.shares + totals.saves,
      source: inlineMetaFetch ? 'DB (after inline Meta fetch)' : 'DB (no Meta call this request)',
      servedFromDb: true,
      metaCalledThisRequest: inlineMetaFetch,
    })
    return totals
  } catch {
    return null
  }
}

/**
 * Read the stored per-DAY insights for a window (summed across accounts), for
 * the time-series chart. Read-only — no enqueue (the KPI read path already
 * triggers backfills). Returns `[{ date, values }]` ascending for days present
 * in the store (may be a subset if the backfill is still running).
 */
export async function getInsightsDaily(
  accountIds: string[],
  from: Date,
  to: Date
): Promise<Array<{ date: string; values: Record<string, number> }>> {
  try {
    if (accountIds.length === 0) return []
    const fromYmd = toUtcYmd(from)
    const toYmd = toUtcYmd(clampToNow(to))
    if (fromYmd > toYmd) return []

    const rows = (await AnalyticsDailyMetricModel.find({
      accountId: { $in: accountIds },
      metricGroup: METRIC_GROUP,
      date: { $gte: fromYmd, $lte: toYmd },
    })
      .select('date values')
      .lean()) as DailyRow[]

    const byDay = new Map<string, Record<string, number>>()
    for (const r of rows) {
      const cur = byDay.get(r.date) ?? {}
      for (const k of INSIGHTS_KEYS) cur[k] = num(cur[k]) + num(r.values?.[k])
      byDay.set(r.date, cur)
    }
    return [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, values]) => ({ date, values }))
  } catch {
    return []
  }
}
