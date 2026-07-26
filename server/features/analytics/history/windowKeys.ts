/**
 * Pure helpers for the analytics history cache — window/day math with no I/O so
 * they are trivially unit-testable (CODING_RULES Rule 9 keeps calculation logic
 * pure and testable).
 */

const DAY_MS = 24 * 60 * 60 * 1000

/** UTC calendar day (`yyyy-mm-dd`) for a Date. */
export function toUtcYmd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Today's UTC calendar day, for deciding whether a window is still mutable. */
export function todayUtcYmd(now: Date = new Date()): string {
  return toUtcYmd(now)
}

/**
 * A window is IMMUTABLE (safe to store forever, never re-fetched) once it ends
 * strictly before today (UTC) — the days it covers are all complete. A window
 * whose end is today or later is still accumulating and must be refreshed.
 */
export function isImmutableWindow(toYmd: string, now: Date = new Date()): boolean {
  return toYmd < todayUtcYmd(now)
}

/**
 * Whether a mutable (today-spanning) cached value is still fresh enough to serve
 * without re-fetching, based on how long ago it was fetched.
 */
export function isFresh(fetchedAt: Date, ttlMs: number, now: Date = new Date()): boolean {
  return now.getTime() - fetchedAt.getTime() < ttlMs
}

/**
 * Stable Redis key for a follows-and-unfollows window total, scoped to the
 * workspace + the exact set of accounts + the exact window.
 */
export function followsRedisKey(
  workspaceId: string,
  accountIds: string[],
  fromYmd: string,
  toYmd: string
): string {
  const accts = [...accountIds].sort().join(',')
  return `analytics:foll:${workspaceId}:${accts}:${fromYmd}:${toYmd}`
}

/**
 * Deterministic BullMQ job id for a backfill so concurrent requests for the same
 * (group, account, window) collapse to a single job. BullMQ forbids `:` in
 * custom job ids, so we use `_` separators (and dates already use `-`). The
 * `group` (e.g. 'follows' / 'insights') keeps different metric families from
 * colliding on the same window.
 */
export function backfillJobId(group: string, accountId: string, fromYmd: string, toYmd: string): string {
  return `${group}-backfill_${accountId}_${fromYmd}_${toYmd}`
}

/** Clamp `to` so a window never extends into the future beyond `now`. */
export function clampToNow(to: Date, now: Date = new Date()): Date {
  return to.getTime() > now.getTime() ? now : to
}

/**
 * Inclusive list of UTC calendar days (`yyyy-mm-dd`) from `fromYmd` to `toYmd`.
 * Returns [] when the range is inverted. Bounded to avoid pathological ranges.
 */
export function enumerateDays(fromYmd: string, toYmd: string, maxDays = 800): string[] {
  if (fromYmd > toYmd) return []
  const out: string[] = []
  let cursor = Date.parse(`${fromYmd}T00:00:00.000Z`)
  const end = Date.parse(`${toYmd}T00:00:00.000Z`)
  if (Number.isNaN(cursor) || Number.isNaN(end)) return []
  for (let i = 0; i <= maxDays && cursor <= end; i++, cursor += DAY_MS) {
    out.push(new Date(cursor).toISOString().slice(0, 10))
  }
  return out
}

/** Days from `required` that are not in `present`. */
export function missingDays(required: string[], present: Set<string>): string[] {
  return required.filter((d) => !present.has(d))
}

export const DAY = DAY_MS
