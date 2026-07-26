/**
 * Veefore Analytics — Narrative helpers (Phase 11).
 *
 * Small shared helpers for confidence combination, metric labelling, and
 * favourability used by recommendations and the executive summary.
 */

import { getMetricByKey, type ConfidenceLevel } from '../metrics'
import type { TrendSignal } from './types'

/** Confidence levels ordered weakest → strongest. */
const CONFIDENCE_ORDER: ConfidenceLevel[] = ['low', 'medium', 'high', 'very_high']

/** The most conservative (lowest) of the given confidence levels. */
export function combineConfidence(levels: ConfidenceLevel[]): ConfidenceLevel {
  if (levels.length === 0) return 'low'
  return levels.reduce((lowest, l) =>
    CONFIDENCE_ORDER.indexOf(l) < CONFIDENCE_ORDER.indexOf(lowest) ? l : lowest
  )
}

/** Display name for a metric key. */
export function metricLabel(metricKey: string): string {
  return getMetricByKey(metricKey)?.name ?? metricKey
}

/** Whether a higher value is better for a metric (defaults to true). */
export function higherIsBetter(metricKey: string): boolean {
  return getMetricByKey(metricKey)?.higherIsBetter ?? true
}

/**
 * Whether a trend's movement is favourable given the metric's direction
 * (rising is good for higher-is-better metrics; falling is good otherwise).
 */
export function isFavourable(trend: TrendSignal): boolean | null {
  if (trend.direction === 'flat') return null
  const good = higherIsBetter(trend.metricKey)
  return trend.direction === 'rising' ? good : !good
}

/** Format a percentage change with an explicit sign. */
export function formatPercent(pct: number | null): string {
  if (pct === null) return 'significantly'
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct}%`
}
