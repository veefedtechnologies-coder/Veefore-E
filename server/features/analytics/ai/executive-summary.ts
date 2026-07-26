/**
 * Veefore Analytics — Executive Summary (Phase 11).
 *
 * Assembles a plain-language summary that leads every dashboard
 * (11-ai-intelligence-engine.md Ch 3): the biggest win, the biggest concern, and
 * a suggested priority — grounded in real numbers, with a confidence level and
 * supporting metrics (CODING_RULES Rule 16). Deterministic template (no LLM),
 * so it can never invent figures.
 */

import type { ExecutiveSummary, TrendSignal } from './types'
import type { ConfidenceLevel } from '../metrics'
import { combineConfidence, formatPercent, isFavourable, metricLabel } from './narrative'

/** Signals with the largest favourable / unfavourable magnitude. */
function pickExtremes(trends: TrendSignal[]): { win?: TrendSignal; concern?: TrendSignal } {
  let win: TrendSignal | undefined
  let concern: TrendSignal | undefined
  for (const t of trends) {
    const fav = isFavourable(t)
    if (fav === null) continue
    const mag = Math.abs(t.changePercent ?? 0)
    if (fav) {
      if (!win || mag > Math.abs(win.changePercent ?? 0)) win = t
    } else if (!concern || mag > Math.abs(concern.changePercent ?? 0)) {
      concern = t
    }
  }
  return { win, concern }
}

/**
 * Build the executive summary from the period's trend signals. Returns a
 * low-confidence "not enough data" summary when there are no usable trends.
 */
export function buildExecutiveSummary(trends: TrendSignal[]): ExecutiveSummary {
  const usable = trends.filter((t) => t.direction !== 'flat' && t.changePercent !== null)

  if (usable.length === 0) {
    return {
      text: 'Not enough data yet to summarize performance for this period.',
      confidence: 'low',
      supportingMetricKeys: [],
    }
  }

  const { win, concern } = pickExtremes(usable)
  const sentences: string[] = []
  const supporting: string[] = []
  const confidences: ConfidenceLevel[] = []

  if (win) {
    sentences.push(
      `${metricLabel(win.metricKey)} improved ${formatPercent(win.changePercent)} — the biggest positive move this period.`
    )
    supporting.push(win.metricKey)
    confidences.push(win.confidence)
  }

  if (concern) {
    sentences.push(
      `${metricLabel(concern.metricKey)} moved ${formatPercent(concern.changePercent)} and needs attention.`
    )
    supporting.push(concern.metricKey)
    confidences.push(concern.confidence)
  }

  if (concern) {
    sentences.push(`Suggested priority: investigate ${metricLabel(concern.metricKey)} first.`)
  } else if (win) {
    sentences.push(`Suggested priority: sustain the gains in ${metricLabel(win.metricKey)}.`)
  }

  return {
    text: sentences.join(' '),
    confidence: combineConfidence(confidences.length ? confidences : ['low']),
    supportingMetricKeys: supporting,
  }
}
