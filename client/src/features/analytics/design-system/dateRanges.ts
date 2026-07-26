/**
 * Date-range presets for analytics filters (03-design-system.md Ch 3 Date
 * Picker). Config-driven so presets are defined once (CODING_RULES Rule 7).
 *
 * Presets mirror the ranges established analytics tools (Hootsuite) expose:
 * to-date ranges, previous calendar periods, rolling windows, plus a fully
 * custom range chosen on a calendar. A comparison window (previous period or a
 * custom range) can be attached so KPIs render genuine period-over-period
 * deltas — exactly the Hootsuite behaviour (e.g. "06/01/24-07/02/26" compared
 * with "05/02/26-05/31/26").
 */

import type { FilterOption } from './types'

export type DateRangePreset =
  | 'today'
  | 'yesterday'
  | 'last_7d'
  | 'last_30d'
  | 'last_90d'
  | 'last_12m'
  | 'month_to_date'
  | 'quarter_to_date'
  | 'year_to_date'
  | 'last_month'
  | 'last_quarter'
  | 'last_year'
  | 'custom'

export const DATE_RANGE_OPTIONS: FilterOption[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last_7d', label: 'Last 7 days' },
  { value: 'last_30d', label: 'Last 30 days' },
  { value: 'last_90d', label: 'Last 90 days' },
  { value: 'last_12m', label: 'Last 12 months' },
  { value: 'month_to_date', label: 'Month to date' },
  { value: 'quarter_to_date', label: 'Quarter to date' },
  { value: 'year_to_date', label: 'Year to date' },
  { value: 'last_month', label: 'Last month' },
  { value: 'last_quarter', label: 'Last quarter' },
  { value: 'last_year', label: 'Last year' },
  { value: 'custom', label: 'Custom range' },
]

/** Default preset applied when none is selected. */
export const DEFAULT_DATE_RANGE: DateRangePreset = 'last_30d'

/** How a comparison window is derived (or disabled). */
export type ComparisonMode = 'none' | 'previous' | 'custom'

/** A user-picked window as `yyyy-mm-dd` strings (local calendar dates). */
export interface DateWindow {
  from?: string
  to?: string
}

/** Comparison configuration attached to a resolved range. */
export interface ComparisonConfig {
  mode: ComparisonMode
  /** Custom comparison window (used only when `mode === 'custom'`). */
  custom?: DateWindow
}

/** Resolved analysis window (+ optional comparison window) as ISO strings. */
export interface ResolvedDateRange {
  from?: string
  to?: string
  compareFrom?: string
  compareTo?: string
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Number of days a rolling preset spans, or null for non-rolling presets. */
const PRESET_DAYS: Partial<Record<DateRangePreset, number>> = {
  last_7d: 7,
  last_30d: 30,
  last_90d: 90,
  last_12m: 365,
}

const startOfDay = (d: Date) => {
  const s = new Date(d)
  s.setUTCHours(0, 0, 0, 0)
  return s
}
const endOfDay = (d: Date) => {
  const s = new Date(d)
  s.setUTCHours(23, 59, 59, 999)
  return s
}
const startOfMonth = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0))
const startOfQuarter = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3, 1, 0, 0, 0, 0))
const startOfYear = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), 0, 1, 0, 0, 0, 0))

/** Resolve the primary analysis window (from/to) for a preset, plus the nominal
 * span used for a "previous period" comparison. */
function resolvePrimary(
  preset: DateRangePreset,
  now: Date,
  custom?: DateWindow
): { from: Date; to: Date; prevSpanMs: number } | null {
  if (preset === 'custom') {
    if (!custom?.from || !custom?.to) return null
    const from = startOfDay(new Date(custom.from))
    const to = endOfDay(new Date(custom.to))
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return null
    return { from, to, prevSpanMs: to.getTime() - from.getTime() }
  }

  const rollingDays = PRESET_DAYS[preset]
  if (rollingDays) {
    return { from: new Date(now.getTime() - rollingDays * DAY_MS), to: now, prevSpanMs: rollingDays * DAY_MS }
  }

  switch (preset) {
    case 'today':
      return { from: startOfDay(now), to: now, prevSpanMs: DAY_MS }
    case 'yesterday': {
      const todayStart = startOfDay(now)
      return { from: new Date(todayStart.getTime() - DAY_MS), to: todayStart, prevSpanMs: DAY_MS }
    }
    case 'month_to_date': {
      const from = startOfMonth(now)
      return { from, to: now, prevSpanMs: now.getTime() - from.getTime() }
    }
    case 'quarter_to_date': {
      const from = startOfQuarter(now)
      return { from, to: now, prevSpanMs: now.getTime() - from.getTime() }
    }
    case 'year_to_date': {
      const from = startOfYear(now)
      return { from, to: now, prevSpanMs: now.getTime() - from.getTime() }
    }
    case 'last_month': {
      const thisMonth = startOfMonth(now)
      const from = new Date(Date.UTC(thisMonth.getUTCFullYear(), thisMonth.getUTCMonth() - 1, 1))
      const to = endOfDay(new Date(thisMonth.getTime() - DAY_MS))
      return { from, to, prevSpanMs: to.getTime() - from.getTime() }
    }
    case 'last_quarter': {
      const thisQuarter = startOfQuarter(now)
      const from = new Date(Date.UTC(thisQuarter.getUTCFullYear(), thisQuarter.getUTCMonth() - 3, 1))
      const to = endOfDay(new Date(thisQuarter.getTime() - DAY_MS))
      return { from, to, prevSpanMs: to.getTime() - from.getTime() }
    }
    case 'last_year': {
      const thisYear = startOfYear(now)
      const from = new Date(Date.UTC(thisYear.getUTCFullYear() - 1, 0, 1))
      const to = endOfDay(new Date(thisYear.getTime() - DAY_MS))
      return { from, to, prevSpanMs: to.getTime() - from.getTime() }
    }
    default:
      return null
  }
}

/**
 * Convert a preset (+ optional custom window and comparison config) into
 * concrete analysis + comparison windows for the dashboard query. Pure
 * query-param construction, not an analytics calculation (Rule 9).
 *
 * `comparison` defaults to `{ mode: 'previous' }` — the immediately-preceding
 * window of the same length — so callers that omit it keep the historical
 * behaviour. `mode: 'none'` drops the comparison; `mode: 'custom'` uses the
 * supplied window.
 */
export function resolveDateRange(
  preset: DateRangePreset,
  now: Date = new Date(),
  custom?: DateWindow,
  comparison: ComparisonConfig = { mode: 'previous' }
): ResolvedDateRange {
  const primary = resolvePrimary(preset, now, custom)
  if (!primary) return {}

  const from = primary.from
  const to = primary.to
  const result: ResolvedDateRange = { from: from.toISOString(), to: to.toISOString() }

  if (comparison.mode === 'none') return result

  if (comparison.mode === 'custom') {
    const cf = comparison.custom?.from
    const ct = comparison.custom?.to
    if (cf && ct) {
      const cFrom = startOfDay(new Date(cf))
      const cTo = endOfDay(new Date(ct))
      if (!Number.isNaN(cFrom.getTime()) && !Number.isNaN(cTo.getTime()) && cFrom <= cTo) {
        result.compareFrom = cFrom.toISOString()
        result.compareTo = cTo.toISOString()
      }
    }
    return result
  }

  // 'previous' — immediately-preceding window of the same nominal length.
  result.compareFrom = new Date(from.getTime() - primary.prevSpanMs).toISOString()
  result.compareTo = from.toISOString()
  return result
}
