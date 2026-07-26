/**
 * Veefore Analytics — Signal Detection (Phase 11).
 *
 * Deterministic trend and anomaly detection over metric series
 * (11-ai-intelligence-engine.md Ch 2 Trend/Anomaly engines). These feed
 * root-cause, recommendations, and the executive summary.
 */

import { round } from '../metrics/calculations'
import type { DataQuality } from '../metrics'
import { deriveConfidence } from './confidence'
import { linearRegression, mean, stdDev } from './stats'
import type { Anomaly, TrendDirection, TrendSignal } from './types'

/** Below this absolute percentage change, a trend is considered flat. */
const FLAT_BAND_PERCENT = 2

/** Detect the trend of a metric series (direction, slope, % change, confidence). */
export function detectTrend(
  metricKey: string,
  series: number[],
  dataQuality?: DataQuality
): TrendSignal {
  const reg = linearRegression(series)
  const first = series[0]
  const last = series[series.length - 1]
  const changePercent =
    series.length >= 2 && first > 0 ? round(((last - first) / first) * 100) : null

  let direction: TrendDirection = 'flat'
  if (changePercent !== null) {
    if (changePercent > FLAT_BAND_PERCENT) direction = 'rising'
    else if (changePercent < -FLAT_BAND_PERCENT) direction = 'falling'
  } else if (reg.slope > 0) direction = 'rising'
  else if (reg.slope < 0) direction = 'falling'

  return {
    metricKey,
    direction,
    slope: round(reg.slope),
    changePercent,
    confidence: deriveConfidence({ points: series.length, rSquared: reg.rSquared, dataQuality }),
  }
}

/**
 * Detect anomalous observations by z-score against the series mean/std.
 * Returns an empty list when the series has no variance or too few points.
 */
export function detectAnomalies(
  metricKey: string,
  series: number[],
  threshold = 2
): Anomaly[] {
  const n = series.length
  if (n < 4) return []
  const m = mean(series)
  const sd = stdDev(series)
  if (sd === 0) return []

  const anomalies: Anomaly[] = []
  for (let i = 0; i < n; i++) {
    const z = (series[i] - m) / sd
    if (Math.abs(z) >= threshold) {
      const abs = Math.abs(z)
      anomalies.push({
        metricKey,
        index: i,
        value: series[i],
        expected: round(m),
        zScore: round(z),
        severity: abs >= 3 ? 'high' : abs >= 2.5 ? 'medium' : 'low',
      })
    }
  }
  return anomalies
}
