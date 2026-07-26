/**
 * TrendIndicator — arrow + percentage/delta showing period-over-period change,
 * coloured by whether the movement is favourable.
 *
 * Displays backend-provided change values only (CODING_RULES Rule 9). Colour
 * semantics honour `higherIsBetter` so e.g. a drop in churn reads as positive.
 */

import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

import { formatDelta, formatPercentChange, trendFromChange } from '../format'
import { TREND_COLOR } from '../tokens'
import type { MetricUnit, TrendDirection } from '../types'

interface TrendIndicatorProps {
  /** Explicit trend; if omitted, derived from the sign of `change`/`changePercent`. */
  trend?: TrendDirection
  change?: number | null
  changePercent?: number | null
  unit?: MetricUnit
  /** What to display: the percentage change, the absolute delta, or both. */
  display?: 'percent' | 'delta' | 'both'
  /** When false, a decrease is favourable (e.g. churn, failure rate). */
  higherIsBetter?: boolean
  className?: string
}

/** Map a raw trend to its favourability given the metric's direction. */
function favourability(trend: TrendDirection, higherIsBetter: boolean): TrendDirection {
  if (trend === 'flat') return 'flat'
  const isPositive = trend === 'up' ? higherIsBetter : !higherIsBetter
  return isPositive ? 'up' : 'down'
}

export function TrendIndicator({
  trend,
  change,
  changePercent,
  unit = 'count',
  display = 'percent',
  higherIsBetter = true,
  className,
}: TrendIndicatorProps) {
  const rawTrend: TrendDirection = trend ?? trendFromChange(change ?? changePercent)
  const tone = favourability(rawTrend, higherIsBetter)
  const Icon = rawTrend === 'up' ? ArrowUpRight : rawTrend === 'down' ? ArrowDownRight : Minus

  const percentText = formatPercentChange(changePercent)
  const deltaText = formatDelta(change, unit)
  const hasPercent = percentText !== '—'
  const hasDelta = deltaText !== '—'

  // Nothing to show.
  if (!hasPercent && !hasDelta) return null

  const label =
    display === 'delta'
      ? deltaText
      : display === 'both'
        ? [percentText !== '—' ? percentText : null, deltaText !== '—' ? deltaText : null]
            .filter(Boolean)
            .join(' · ')
        : percentText !== '—'
          ? percentText
          : deltaText

  return (
    <span className={cn('inline-flex items-center gap-0.5 text-sm font-medium', TREND_COLOR[tone], className)}>
      <Icon className="h-4 w-4" aria-hidden="true" />
      <span>{label}</span>
    </span>
  )
}
