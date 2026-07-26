/**
 * Veefore Analytics Design System — Formatting utilities (Phase 3).
 *
 * Pure presentation helpers that format backend-provided numbers for display.
 * These do NOT compute analytics (CODING_RULES Rule 9) — they only format values
 * that were already computed by the backend metric engine.
 */

import type { MetricUnit, TrendDirection } from './types'

/** Compact large counts: 1_250 → "1.3K", 2_400_000 → "2.4M". */
export function compactNumber(value: number, maxFractionDigits = 1): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: maxFractionDigits,
  }).format(value)
}

/** Format a plain integer count with grouping: 1250 → "1,250". */
export function formatCount(value: number, compact = true): string {
  if (compact && Math.abs(value) >= 10_000) return compactNumber(value)
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)
}

/** Format seconds as a human duration: 80 → "1m 20s", 3661 → "1h 1m". */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const hours = Math.floor(s / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  const seconds = s % 60
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

export interface FormatValueOptions {
  /** Currency ISO code for `currency` unit. Defaults to USD. */
  currency?: string
  /** Placeholder for null/undefined values. Defaults to "—". */
  emptyPlaceholder?: string
  /** Whether to compact large counts. Defaults to true. */
  compact?: boolean
}

/**
 * Format a metric value according to its unit. Returns the empty placeholder for
 * `null`/`undefined` (never fabricates a value).
 */
export function formatMetricValue(
  value: number | null | undefined,
  unit: MetricUnit = 'count',
  options: FormatValueOptions = {}
): string {
  const { currency = 'USD', emptyPlaceholder = '—', compact = true } = options
  if (value === null || value === undefined || !Number.isFinite(value)) return emptyPlaceholder

  switch (unit) {
    case 'percent':
      return `${roundForDisplay(value)}%`
    case 'ratio':
      return `${roundForDisplay(value)}x`
    case 'currency':
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        maximumFractionDigits: Math.abs(value) >= 1000 ? 0 : 2,
      }).format(value)
    case 'seconds':
      return formatDuration(value)
    case 'per_hour':
      return `${formatCount(value, compact)}/hr`
    case 'score':
      return `${roundForDisplay(value)}`
    case 'count':
    default:
      return formatCount(value, compact)
  }
}

/** Round to at most 2 decimals, dropping trailing zeros for clean display. */
function roundForDisplay(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/**
 * Derive a trend direction from a signed change value. This is display logic
 * (sign of a backend-provided number), not an analytics calculation.
 */
export function trendFromChange(change: number | null | undefined): TrendDirection {
  if (change === null || change === undefined || !Number.isFinite(change) || change === 0) {
    return 'flat'
  }
  return change > 0 ? 'up' : 'down'
}

/** Format an absolute change with an explicit sign: 200 → "+200", -50 → "−50".
 * Returns the placeholder for null/NaN and also for 0 (no movement). */
export function formatDelta(
  change: number | null | undefined,
  unit: MetricUnit = 'count',
  options: FormatValueOptions = {}
): string {
  if (change === null || change === undefined || !Number.isFinite(change) || change === 0) {
    return options.emptyPlaceholder ?? '—'
  }
  const sign = change > 0 ? '+' : '−'
  return `${sign}${formatMetricValue(Math.abs(change), unit, options)}`
}

/** Format a percentage change with sign: 12.5 → "+12.5%", -0.3 → "−0.3%".
 * Returns the placeholder for null/NaN and also for exactly 0 (0% change is
 * shown as flat — the TrendIndicator renders a minus icon instead). */
export function formatPercentChange(
  percent: number | null | undefined,
  emptyPlaceholder = '—'
): string {
  if (percent === null || percent === undefined || !Number.isFinite(percent)) return emptyPlaceholder
  if (percent === 0) return emptyPlaceholder
  const sign = percent > 0 ? '+' : '−'
  return `${sign}${Math.abs(roundForDisplay(percent))}%`
}

/** Format an ISO timestamp as a short "Updated …" relative-ish label. */
export function formatLastUpdated(iso: string | undefined): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}
