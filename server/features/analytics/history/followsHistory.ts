/**
 * Follows-and-unfollows history store — a durable PER-DAY read-through cache
 * that keeps the expensive, rate-limited Meta fetch OFF the request path AND
 * makes every range (and every sub-range/overlap) answerable from MongoDB.
 *
 * Why per-day: Meta only exposes `follows_and_unfollows` as a window TOTAL
 * (`time_series` is rejected), so we fetch each day individually (1-day
 * `total_value` window) and store it. A completed day is immutable, so once
 * stored it is never re-fetched — and ANY range is just the SUM of its stored
 * days. Viewing Jan–Mar after having viewed a full year is served entirely from
 * the DB, because those days were already stored.
 *
 * Read path (HTTP request): Redis exact-window cache → MongoDB per-day sum. When
 * days are missing/stale it enqueues a BullMQ backfill (the worker is the sole
 * Meta writer) and returns a value only when the window is FULLY covered — never
 * a partial/understated number. If not yet covered it returns `null` so the KPI
 * falls back to the genuine snapshot-derived value while the worker backfills.
 */

import AnalyticsDailyMetricModel from '../../../models/Analytics/AnalyticsDailyMetric'
import { InstagramApiService } from '../../../services/instagramApi'
import { getRedisClient } from '../../../lib/redis'
import { socialAccountRepository } from '../../../repositories/SocialAccountRepository'
import { getAccessTokenFromAccount } from '../../../storage/converters'
import { histLog } from './historyDebugLog'
import {
  clampToNow,
  enumerateDays,
  followsRedisKey,
  isFresh,
  isImmutableWindow,
  missingDays,
  toUtcYmd,
  todayUtcYmd,
  DAY,
} from './windowKeys'

const METRIC_GROUP = 'follows_and_unfollows'
const PLATFORM = 'instagram'

/** Today's stored value is refreshed at most this often. */
const MUTABLE_TTL_MS = 30 * 60 * 1000 // 30 min
const REDIS_TTL_IMMUTABLE_S = 24 * 60 * 60 // 24h
const REDIS_TTL_MUTABLE_S = 5 * 60 // 5 min
/** How much history to proactively backfill on first sight (~24 months, Meta's
 * retention). Backfilling the WHOLE range up front — not just the viewed
 * window — is how Hootsuite makes every date range load instantly: after the
 * one-time sync every range is a pure DB read. */
const PREWARM_DAYS = 730
/** Tolerate a tiny leading gap at the very edge of Meta's retention — the oldest
 * 1–few days a comparison window may reach that Meta no longer returns. Larger
 * leading gaps (a window mostly older than retention) stay uncovered → honest
 * null (no misleading, understated comparison). */
const LEADING_GAP_TOLERANCE_DAYS = 3

export interface FollowsFlow {
  gained: number
  lost: number
}

export interface HistoryAccount {
  accountId: string
  token: string
}

/**
 * Resolve the CURRENT valid access token for an account straight from the DB at
 * execution time. The scheduled token-refresh job (`TokenRefreshService`) rotates
 * the long-lived token ~7 days before expiry and writes the new ENCRYPTED token,
 * so re-reading here means the backfill worker always uses the freshest token —
 * even if the job was enqueued (or retried) with a token that has since rotated.
 * Returns null when the account is gone/inactive or the token can't be
 * decrypted (e.g. fully expired → needs reconnect), so the worker skips cleanly.
 */
export async function getFreshTokenForAccount(accountId: string): Promise<string | null> {
  try {
    const { SocialAccountModel } = await import('../../../models/Social/SocialAccount')
    const acc = await SocialAccountModel.findOne({
      accountId,
      platform: 'instagram',
      isActive: true,
    }).lean()
    if (!acc) {
      histLog('TOKEN_LOOKUP_NO_ACCOUNT', { accountId })
      return null
    }
    const token = getAccessTokenFromAccount(acc)
    histLog('TOKEN_LOOKUP', { accountId, hasToken: !!token })
    return token
  } catch (e) {
    histLog('TOKEN_LOOKUP_ERROR', { accountId, error: (e as Error).message })
    return null
  }
}

/**
 * Kick off the full-history follows + insights backfill for every active
 * Instagram account in a workspace — triggered right after OAuth connect.
 *
 * Rate-limit-safe phased strategy:
 *   Phase 0 (immediate):   most recent 6 months → ~180 API sub-requests
 *   Phase 1 (+1 hour):     months 7–12          → ~180 API sub-requests
 *   Phase 2 (+2 hours):    months 13–18         → ~180 API sub-requests
 *   Phase 3 (+3 hours):    months 19–24         → ~180 API sub-requests
 *
 * Each phase is a separate BullMQ job with a different fromIso/toIso window.
 * The worker skips days already stored (immutable), so reconnecting re-uses
 * the DB and only fetches new days. Fire-and-forget; never throws.
 */
export async function prewarmFollowsForWorkspace(workspaceId: string): Promise<void> {
  try {
    const accounts = await socialAccountRepository.findActiveByWorkspace(workspaceId)
    const igAccounts = accounts.filter((a) => a.platform === 'instagram' && a.accountId)
    histLog('CONNECT_PREWARM_START', {
      workspaceId,
      totalAccounts: accounts.length,
      instagramAccounts: igAccounts.length,
      strategy: 'phased-6month-chunks',
    })

    const now = new Date()
    const MONTH_MS = 30 * DAY // 30-day months for even distribution
    const HOUR_MS = 60 * 60 * 1000

    // 4 phases × 6 months each = 24 months total (730 days)
    // Phase 0 is immediate; phases 1-3 are delayed by 1/2/3 hours respectively
    const phases = [
      { fromMs: now.getTime() - 6 * MONTH_MS,  toMs: now.getTime(),              delayMs: 0 },
      { fromMs: now.getTime() - 12 * MONTH_MS, toMs: now.getTime() - 6 * MONTH_MS,  delayMs: 1 * HOUR_MS },
      { fromMs: now.getTime() - 18 * MONTH_MS, toMs: now.getTime() - 12 * MONTH_MS, delayMs: 2 * HOUR_MS },
      { fromMs: now.getTime() - 24 * MONTH_MS, toMs: now.getTime() - 18 * MONTH_MS, delayMs: 3 * HOUR_MS },
    ]

    const { AnalyticsHistoryQueueManager } = await import('../../../queues/analyticsHistoryQueue')

    for (const acc of accounts) {
      if (acc.platform !== 'instagram' || !acc.accountId) continue
      const token = getAccessTokenFromAccount(acc)
      if (!token) {
        histLog('CONNECT_PREWARM_SKIP_NO_TOKEN', { workspaceId, accountId: String(acc.accountId) })
        continue
      }

      for (let phase = 0; phase < phases.length; phase++) {
        const { fromMs, toMs, delayMs } = phases[phase]
        const fromIso = new Date(fromMs).toISOString()
        const toIso = new Date(toMs).toISOString()
        const fromYmd = fromIso.slice(0, 10)
        const toYmd = toIso.slice(0, 10)

        const [enqueuedFollows, enqueuedInsights] = await Promise.all([
          AnalyticsHistoryQueueManager.enqueueFollows({
            kind: 'follows_and_unfollows',
            workspaceId,
            accountId: String(acc.accountId),
            token,
            fromIso,
            toIso,
          }, delayMs),
          AnalyticsHistoryQueueManager.enqueueInsights({
            kind: 'insights',
            workspaceId,
            accountId: String(acc.accountId),
            token,
            fromIso,
            toIso,
          }, delayMs),
        ])

        histLog('CONNECT_PREWARM_ENQUEUE', {
          workspaceId,
          accountId: String(acc.accountId),
          phase,
          fromYmd,
          toYmd,
          delayMinutes: Math.round(delayMs / 60000),
          enqueuedFollows,
          enqueuedInsights,
          note: delayMs === 0
            ? 'phase 0: immediate (most recent 6 months)'
            : `phase ${phase}: starts in ${Math.round(delayMs / 60000)} min`,
        })
      }
    }
    histLog('CONNECT_PREWARM_DONE', { workspaceId, phases: phases.length })
  } catch (e) {
    histLog('CONNECT_PREWARM_ERROR', { workspaceId, error: (e as Error).message })
    // Best-effort prewarm; the first dashboard load will trigger it otherwise.
  }
}

interface DailyRow {
  date: string
  values?: Record<string, number>
  fetchedAt?: Date
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/** Redis client only when connected — avoids hanging when Redis is offline. */
function redisIfReady() {
  try {
    const client = getRedisClient()
    return client && client.status === 'ready' ? client : null
  } catch {
    return null
  }
}

/** Previous UTC day (`yyyy-mm-dd`) — the last complete/immutable day. */
function prevDayYmd(now: Date): string {
  return toUtcYmd(new Date(now.getTime() - DAY))
}

/**
 * Fetch the per-day gained/lost for a window from Meta and upsert each day into
 * the durable store. Only the GAPS are fetched: immutable days already stored
 * are skipped (so backfills/retries are cheap and idempotent). Today is always
 * (re)fetched because it is still accumulating. May be slow (one request per
 * missing day) — it runs in the BullMQ worker, off the request path.
 */
export async function fetchAndPersistFollowsDaily(
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

  // Skip immutable days we already have; never skip today (mutable).
  const todayY = todayUtcYmd(now)
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

  const totalDaysInWindow = enumerateDays(fromYmd, toYmd).length
  histLog('BACKFILL_START', {
    accountId,
    workspaceId,
    fromYmd,
    toYmd,
    totalDaysInWindow,
    alreadyStoredImmutable: skip.size,
    willFetchApprox: Math.max(0, totalDaysInWindow - skip.size),
    reusedFromDb: skip.size > 0,
    note:
      skip.size >= totalDaysInWindow - 1
        ? 'RECONNECT/REPEAT: (almost) all days already in DB — fetching only today/new days'
        : 'fetching missing days from Meta',
  })

  const days = await InstagramApiService.getFollowsAndUnfollowsDaily(accountId, token, from, toC, skip)

  await Promise.all(
    days.map((d) =>
      AnalyticsDailyMetricModel.updateOne(
        { accountId, metricGroup: METRIC_GROUP, date: d.date },
        {
          $set: {
            workspaceId,
            platform: PLATFORM,
            values: { gained: num(d.gained), lost: num(d.lost) },
            immutable: d.date < todayY,
            fetchedAt: now,
          },
        },
        { upsert: true }
      ).exec()
    )
  )

  histLog('BACKFILL_DONE', {
    accountId,
    workspaceId,
    fromYmd,
    toYmd,
    daysFetchedFromMeta: days.length,
    daysSkippedFromDb: skip.size,
  })
}

/**
 * Read follows-and-unfollows totals for a window across accounts by summing the
 * durable per-day store. Serves Redis → MongoDB; enqueues a BullMQ backfill for
 * missing/stale days. Returns a value only when EVERY day in the window is
 * covered (never understated); otherwise `null` so the caller falls back to a
 * genuine derived value while the worker populates the store. Never throws.
 */
export async function getFollowsRange(
  workspaceId: string,
  accounts: HistoryAccount[],
  from: Date,
  to: Date
): Promise<FollowsFlow | null> {
  try {
    if (accounts.length === 0) return null
    const now = new Date()
    const toC = clampToNow(to, now)
    const fromYmd = toUtcYmd(from)
    const toYmd = toUtcYmd(toC)
    if (fromYmd > toYmd) return { gained: 0, lost: 0 }

    const ids = accounts.map((a) => a.accountId)
    const key = followsRedisKey(workspaceId, ids, fromYmd, toYmd)

    // 1) Redis exact-window fast path.
    const client = redisIfReady()
    if (client) {
      try {
        const hit = await client.get(key)
        if (hit) {
          const parsed = JSON.parse(hit) as FollowsFlow
          histLog('READ_REDIS_HIT', {
            workspaceId,
            ids,
            fromYmd,
            toYmd,
            gained: num(parsed.gained),
            lost: num(parsed.lost),
            source: 'REDIS (no Meta call, no DB read)',
            servedFromDb: true,
            metaCalledThisRequest: false,
          })
          return { gained: num(parsed.gained), lost: num(parsed.lost) }
        }
      } catch {
        // fall through to Mongo
      }
    }

    const todayY = todayUtcYmd(now)
    const includesToday = toYmd >= todayY
    // Days that MUST be present for full coverage: every complete day in range.
    const lastImmutable = toYmd < todayY ? toYmd : prevDayYmd(now)
    const requiredImmutable = enumerateDays(fromYmd, lastImmutable)

    const { AnalyticsHistoryQueueManager } = await import('../../../queues/analyticsHistoryQueue')

    let gained = 0
    let lost = 0
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
        const g = list.reduce((s, r) => s + num(r.values?.gained), 0)
        const l = list.reduce((s, r) => s + num(r.values?.lost), 0)
        // Interior/trailing gaps (backfill not done or real gaps) still require a
        // backfill; a tiny LEADING gap at the retention edge is tolerated.
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
        const todayStale = includesToday && (!todayRow || !isFresh(todayRow.fetchedAt ?? new Date(0), MUTABLE_TTL_MS, now))
        const covered =
          interiorGaps.length === 0 &&
          leadingGap <= LEADING_GAP_TOLERANCE_DAYS &&
          (!includesToday || present.has(todayY))
        return { g, l, gaps: interiorGaps, todayStale, covered }
      }

      let evalResult = evaluate(rows)

      histLog('READ_DB_COVERAGE', {
        workspaceId,
        accountId: acc.accountId,
        fromYmd,
        toYmd,
        storedDays: rows.length,
        requiredDays: requiredImmutable.length,
        missingDays: evalResult.gaps.length,
        includesToday,
        todayStale: evalResult.todayStale,
        covered: evalResult.covered,
        servedFrom: evalResult.covered ? 'DB (no Meta call)' : 'fallback (backfill enqueued)',
      })

      if (evalResult.gaps.length > 0 || evalResult.todayStale) {
        // Enqueue a FULL-HISTORY backfill (~24 months up to now), not just the
        // viewed window — so after the one-time sync every range/sub-range is a
        // pure DB read (the Hootsuite model). The worker skips days already
        // stored, so this is idempotent; the jobId changes each day, so it also
        // appends the newest day automatically (daily incremental). The worker
        // is the sole Meta writer.
        const prewarmFrom = new Date(now.getTime() - PREWARM_DAYS * DAY)
        const enqueued = await AnalyticsHistoryQueueManager.enqueueFollows({
          kind: 'follows_and_unfollows',
          workspaceId,
          accountId: acc.accountId,
          token: acc.token,
          fromIso: prewarmFrom.toISOString(),
          toIso: now.toISOString(),
        })
        histLog('READ_ENQUEUE_BACKFILL', {
          workspaceId,
          accountId: acc.accountId,
          missingDays: evalResult.gaps.length,
          todayStale: evalResult.todayStale,
          enqueued,
          mode: enqueued ? 'BullMQ worker' : 'inline fallback (queue unavailable or enqueue failed)',
        })
        if (enqueued) backgroundBackfillEnqueued = true
        if (!enqueued) {
          try {
            inlineMetaFetch = true
            await fetchAndPersistFollowsDaily(workspaceId, acc.accountId, acc.token, from, toC)
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
        gained += evalResult.g
        lost += evalResult.l
      } else {
        allCovered = false
      }
    }

    const rangeDays = requiredImmutable.length + (includesToday ? 1 : 0)
    const approxMonths = Math.round((rangeDays / 30) * 10) / 10

    // Only return a number when the whole window is covered — never a partial.
    if (!allCovered) {
      histLog('READ_RESULT', {
        workspaceId,
        ids,
        fromYmd,
        toYmd,
        rangeDays,
        approxMonths,
        source: 'FALLBACK (snapshot-derived) — background backfill running',
        servedFromDb: false,
        metaCalledThisRequest: inlineMetaFetch,
        backgroundBackfillEnqueued,
        note: 'window not fully in DB yet (often a comparison window older than 24 months, which Meta does not retain)',
      })
      return null
    }

    const result: FollowsFlow = { gained, lost }
    if (client) {
      try {
        const ttl = isImmutableWindow(toYmd, now) ? REDIS_TTL_IMMUTABLE_S : REDIS_TTL_MUTABLE_S
        await client.set(key, JSON.stringify(result), 'EX', ttl)
      } catch {
        // best-effort
      }
    }

    histLog('READ_RESULT', {
      workspaceId,
      ids,
      fromYmd,
      toYmd,
      rangeDays,
      approxMonths,
      gained,
      lost,
      source: inlineMetaFetch
        ? 'DB (after a one-time inline Meta fetch this request — Redis was down)'
        : 'DB (no Meta call this request)',
      servedFromDb: true,
      metaCalledThisRequest: inlineMetaFetch,
    })
    return result
  } catch {
    return null
  }
}
