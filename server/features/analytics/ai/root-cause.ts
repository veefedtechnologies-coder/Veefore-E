/**
 * Veefore Analytics — Root-Cause Analysis (Phase 11).
 *
 * Explains a metric's change by ranking candidate contributing factors that
 * moved in a consistent direction (11-ai-intelligence-engine.md Ch 4). Purely
 * correlational and explicitly labelled as such — it never asserts causation
 * (Ch 15 AI safety).
 */

import { getMetricByKey } from '../metrics'
import type { ContributingFactor, RootCause, TrendDirection } from './types'

function directionOf(changePercent: number | null): TrendDirection {
  if (changePercent === null || Math.abs(changePercent) < 2) return 'flat'
  return changePercent > 0 ? 'rising' : 'falling'
}

function label(metricKey: string): string {
  return getMetricByKey(metricKey)?.name ?? metricKey
}

export interface RootCauseInput {
  metricKey: string
  changePercent: number | null
}

/**
 * Rank candidate factors that changed in the same direction as the target
 * metric (a plausible correlational link), strongest first. Returns at most
 * `maxFactors` (default 3).
 */
export function analyzeRootCause(
  target: RootCauseInput,
  candidates: RootCauseInput[],
  maxFactors = 3
): RootCause {
  const targetDirection = directionOf(target.changePercent)

  const factors: ContributingFactor[] = candidates
    .filter((c) => c.metricKey !== target.metricKey && c.changePercent !== null)
    .map((c) => ({
      metricKey: c.metricKey,
      changePercent: c.changePercent,
      direction: directionOf(c.changePercent),
      note: `${label(c.metricKey)} changed ${formatPct(c.changePercent)} over the same period.`,
    }))
    // Same-direction movement as the target is the correlational signal.
    .filter((f) => targetDirection !== 'flat' && f.direction === targetDirection)
    .sort((a, b) => Math.abs(b.changePercent ?? 0) - Math.abs(a.changePercent ?? 0))
    .slice(0, maxFactors)

  return {
    metricKey: target.metricKey,
    changePercent: target.changePercent,
    direction: targetDirection,
    factors,
    caveat:
      'These factors correlate with the change and are candidate explanations only — correlation does not imply causation.',
  }
}

function formatPct(pct: number | null): string {
  if (pct === null) return 'n/a'
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct}%`
}
