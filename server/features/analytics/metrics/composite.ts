/**
 * Veefore Analytics — Composite Score Framework (Phase 2).
 *
 * Composite scores (Virality, Account Health, Audience Loyalty, etc.) combine
 * several underlying metrics into a single 0–100 score
 * (02-metrics-dictionary.md Ch 19). The dictionary specifies that each composite
 * must define its *component metrics and weights*, score range, and display
 * conditions — but it does NOT specify the concrete weights.
 *
 * ── Documentation gap (flagged per CODING_RULES Rule 2) ──────────────────────
 * Because the component weights are not defined in the documentation, we do NOT
 * invent them. This module provides the reusable, tested framework — score
 * normalization and weighted aggregation — and the engine computes a composite
 * ONLY when the caller supplies an explicit weight configuration. Concrete
 * per-composite weights are pending a documentation update.
 */

import { round } from './calculations'
import type { CompositeComponent } from './types'

/** Clamp `value` into the inclusive `[min, max]` range. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Linearly normalize a raw metric value into a 0–100 sub-score against an
 * expected `[min, max]` range, clamped to the range.
 *
 * @param value          Raw metric value.
 * @param min            Value mapping to 0 (worst).
 * @param max            Value mapping to 100 (best).
 * @param higherIsBetter When false, the scale is inverted (lower raw = higher score).
 * @returns 0–100 sub-score, or `null` if inputs are invalid or the range is empty.
 */
export function normalizeToScore(
  value: number,
  min: number,
  max: number,
  higherIsBetter: boolean = true
): number | null {
  if (![value, min, max].every((n) => typeof n === 'number' && Number.isFinite(n))) return null
  if (max === min) return null

  const clamped = clamp(value, Math.min(min, max), Math.max(min, max))
  const fraction = (clamped - min) / (max - min)
  const score = (higherIsBetter ? fraction : 1 - fraction) * 100
  return round(clamp(score, 0, 100))
}

/** Options controlling composite aggregation. */
export interface CompositeScoreOptions {
  /**
   * Minimum number of valid components required to produce a score. If fewer are
   * present the score is not displayed (returns `null`), honoring the "conditions
   * under which the score should not be displayed" rule (Ch 19). Defaults to 1.
   */
  minComponents?: number
}

/**
 * Aggregate weighted component sub-scores into a single 0–100 composite score.
 *
 * Weights need not be pre-normalized; they are normalized by their sum. Each
 * component score must already be a 0–100 sub-score (see {@link normalizeToScore}).
 *
 * @returns The 0–100 composite score, or `null` when there are too few valid
 *          components or the total weight is not positive. Never fabricated.
 */
export function computeCompositeScore(
  components: CompositeComponent[],
  options: CompositeScoreOptions = {}
): number | null {
  const { minComponents = 1 } = options

  const valid = components.filter(
    (c) =>
      Number.isFinite(c.score) &&
      Number.isFinite(c.weight) &&
      c.weight > 0 &&
      c.score >= 0 &&
      c.score <= 100
  )

  if (valid.length < minComponents) return null

  const totalWeight = valid.reduce((sum, c) => sum + c.weight, 0)
  if (totalWeight <= 0) return null

  const weighted = valid.reduce((sum, c) => sum + c.score * c.weight, 0)
  return round(clamp(weighted / totalWeight, 0, 100))
}
