/**
 * Veefore Analytics — Confidence System (Phase 11).
 *
 * Derives a confidence level from data quantity, model fit, and data quality —
 * never an arbitrary percentage (11-ai-intelligence-engine.md Ch 13). Pure and
 * deterministic so the same evidence always yields the same confidence.
 */

import type { ConfidenceLevel } from '../metrics'
import type { ConfidenceInput } from './types'

/**
 * Compute a confidence level. Scores contributions from sample size, fit
 * quality, and provenance, then maps the total to a label.
 */
export function deriveConfidence({ points, rSquared, dataQuality }: ConfidenceInput): ConfidenceLevel {
  let score = 0

  // Sample size.
  if (points >= 30) score += 2
  else if (points >= 14) score += 1
  else if (points < 5) score -= 1

  // Model fit (when applicable).
  if (rSquared !== undefined) {
    if (rSquared >= 0.8) score += 2
    else if (rSquared >= 0.5) score += 1
    else if (rSquared < 0.25) score -= 1
  }

  // Provenance.
  switch (dataQuality) {
    case 'verified':
      score += 1
      break
    case 'estimated':
    case 'predicted':
      score -= 1
      break
    default:
      break
  }

  if (score >= 4) return 'very_high'
  if (score >= 3) return 'high'
  if (score >= 1) return 'medium'
  return 'low'
}
