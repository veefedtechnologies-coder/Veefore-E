/**
 * Veefore Analytics — Forecasting (Phase 11).
 *
 * Deterministic linear-regression forecasts with prediction intervals and a
 * confidence level (11-ai-intelligence-engine.md Ch 6). Forecasts are clearly
 * labelled predictions, never presented as observed facts (Ch 15). Grounded in
 * the metric's own history — nothing is fabricated (CODING_RULES Rule 16).
 */

import { round } from '../metrics/calculations'
import type { DataQuality } from '../metrics'
import { deriveConfidence } from './confidence'
import { linearRegression } from './stats'
import type { Forecast, ForecastPoint } from './types'

export interface ForecastOptions {
  /** Periods to project. Defaults to 7. */
  horizon?: number
  /** Provenance of the source series (affects confidence). */
  dataQuality?: DataQuality
  /** Clamp predictions to be non-negative (true for counts). Defaults to true. */
  nonNegative?: boolean
}

/** ~95% prediction interval multiplier. */
const Z_95 = 1.96

/**
 * Forecast a metric `horizon` periods ahead from its historical values.
 * With fewer than 2 points, returns a low-confidence flat projection.
 */
export function forecastSeries(
  metricKey: string,
  series: number[],
  options: ForecastOptions = {}
): Forecast {
  const { horizon = 7, dataQuality, nonNegative = true } = options
  const n = series.length

  const clamp = (v: number) => (nonNegative ? Math.max(0, v) : v)

  if (n < 2) {
    const base = clamp(series[0] ?? 0)
    const predictions: ForecastPoint[] = Array.from({ length: horizon }, () => ({
      value: round(base),
      lower: round(base),
      upper: round(base),
    }))
    return {
      metricKey,
      horizon,
      predictions,
      confidence: 'low',
      method: 'linear_regression',
      assumptions: ['Insufficient history — projection assumes no change.'],
    }
  }

  const reg = linearRegression(series)
  const margin = Z_95 * reg.stdErr

  const predictions: ForecastPoint[] = Array.from({ length: horizon }, (_, h) => {
    const x = n - 1 + (h + 1)
    const value = clamp(reg.intercept + reg.slope * x)
    return {
      value: round(value),
      lower: round(clamp(value - margin)),
      upper: round(value + margin),
    }
  })

  return {
    metricKey,
    horizon,
    predictions,
    confidence: deriveConfidence({ points: n, rSquared: reg.rSquared, dataQuality }),
    method: 'linear_regression',
    assumptions: [
      'The recent linear trend continues.',
      'No major external changes (algorithm shifts, campaigns).',
    ],
  }
}
