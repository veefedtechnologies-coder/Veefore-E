/**
 * Veefore Analytics — Recommendation Engine (Phase 11).
 *
 * Turns detected trends into actionable, evidence-backed recommendations
 * (11-ai-intelligence-engine.md Ch 5). Every recommendation references the
 * metric that motivates it and carries a confidence level (CODING_RULES Rule 16).
 */

import type { AIRecommendation, TrendSignal } from './types'
import { combineConfidence, formatPercent, isFavourable, metricLabel } from './narrative'

export interface RecommendationOptions {
  /** Only consider trends at or above this confidence. Defaults to 'medium'. */
  minConfidence?: 'low' | 'medium' | 'high'
  /** Max recommendations to return. Defaults to 5. */
  limit?: number
}

const CONF_RANK = { low: 0, medium: 1, high: 2, very_high: 3 } as const

/**
 * Build recommendations from trend signals. Favourable trends yield "amplify"
 * recommendations; unfavourable trends yield "investigate/act" recommendations.
 * Sorted by the magnitude of change.
 */
export function buildRecommendations(
  trends: TrendSignal[],
  options: RecommendationOptions = {}
): AIRecommendation[] {
  const { minConfidence = 'medium', limit = 5 } = options
  const minRank = CONF_RANK[minConfidence]

  return trends
    .filter((t) => t.direction !== 'flat' && CONF_RANK[t.confidence] >= minRank)
    .sort((a, b) => Math.abs(b.changePercent ?? 0) - Math.abs(a.changePercent ?? 0))
    .slice(0, limit)
    .map((t) => toRecommendation(t))
}

function toRecommendation(trend: TrendSignal): AIRecommendation {
  const name = metricLabel(trend.metricKey)
  const change = formatPercent(trend.changePercent)
  const favourable = isFavourable(trend)
  const direction = trend.direction === 'rising' ? 'improved' : 'declined'

  const title = favourable
    ? `Keep the momentum on ${name}`
    : `Address the decline in ${name}`

  const explanation = favourable
    ? `${name} ${direction} ${change} over the period. Double down on what's working to sustain this trend.`
    : `${name} ${direction} ${change} over the period. Investigate the drivers and take corrective action.`

  const expectedBenefit = favourable
    ? `Sustaining this trajectory should continue improving ${name}.`
    : `Reversing this trend should recover lost ${name}.`

  return {
    id: `rec_${trend.metricKey}`,
    title,
    explanation,
    expectedBenefit,
    difficulty: 'medium',
    confidence: combineConfidence([trend.confidence]),
    supportingMetricKeys: [trend.metricKey],
  }
}
