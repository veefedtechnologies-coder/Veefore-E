/**
 * Veefore Analytics — Widget display utilities (Phase 5).
 *
 * Pure helpers for widget presentation only (bar fills, heatmap intensity,
 * confidence labels). These format/scale backend-provided values for display —
 * they do not compute analytics (CODING_RULES Rule 9).
 */

import type { ConfidenceLevel } from './types'

/**
 * Fraction (0–1) for a progress bar fill, given a current value and goal.
 * This is UI rendering of two backend-provided numbers, clamped to [0, 1].
 * Returns 0 for a non-positive goal.
 */
export function progressFraction(current: number, goal: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(goal) || goal <= 0) return 0
  return Math.min(1, Math.max(0, current / goal))
}

/**
 * Heatmap cell intensity (0–1) relative to the max value in the set, for opacity
 * scaling. Returns 0 when max is non-positive or the value is invalid.
 */
export function heatmapIntensity(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0
  return Math.min(1, Math.max(0, value / max))
}

/** Human-readable confidence label. */
export const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = {
  very_high: 'Very high confidence',
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
}

/** Short confidence label for compact badges. */
export const CONFIDENCE_SHORT: Record<ConfidenceLevel, string> = {
  very_high: 'Very high',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}
