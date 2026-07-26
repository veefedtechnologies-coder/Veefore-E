/**
 * Veefore Analytics — AI Intelligence Engine (Phase 11).
 *
 * Orchestrates the deterministic intelligence modules over metric series
 * (11-ai-intelligence-engine.md Ch 1). Consumes METRICS only — never platform
 * APIs (Ch 1) — and every output is evidence-based and confidence-scored
 * (CODING_RULES Rule 16).
 */

import type { DataQuality } from '../metrics'
import { buildExecutiveSummary } from './executive-summary'
import { forecastSeries, type ForecastOptions } from './forecast'
import { buildRecommendations } from './recommendations'
import { analyzeRootCause, type RootCauseInput } from './root-cause'
import { detectAnomalies, detectTrend } from './signals'
import type {
  AIRecommendation,
  Anomaly,
  ExecutiveSummary,
  Forecast,
  RootCause,
  TrendSignal,
} from './types'

export interface AnalyzeInput {
  /** Metric key → ordered series of values (oldest first). */
  series: Record<string, number[]>
  /** Provenance of the series (affects confidence). */
  dataQuality?: DataQuality
  /** Forecast horizon in periods. Defaults to 7. */
  forecastHorizon?: number
}

export interface AnalysisResult {
  trends: TrendSignal[]
  anomalies: Anomaly[]
  forecasts: Forecast[]
  recommendations: AIRecommendation[]
  executiveSummary: ExecutiveSummary
}

/** The deterministic analytics intelligence engine. */
export class AIIntelligenceEngine {
  /** Full analysis over a set of metric series. */
  analyze(input: AnalyzeInput): AnalysisResult {
    const { series, dataQuality, forecastHorizon = 7 } = input
    const keys = Object.keys(series)

    const trends: TrendSignal[] = keys.map((key) => detectTrend(key, series[key], dataQuality))
    const anomalies: Anomaly[] = keys.flatMap((key) => detectAnomalies(key, series[key]))
    const forecasts: Forecast[] = keys.map((key) =>
      forecastSeries(key, series[key], { horizon: forecastHorizon, dataQuality })
    )
    const recommendations = buildRecommendations(trends)
    const executiveSummary = buildExecutiveSummary(trends)

    return { trends, anomalies, forecasts, recommendations, executiveSummary }
  }

  /** Forecast a single metric series. */
  forecast(metricKey: string, series: number[], options?: ForecastOptions): Forecast {
    return forecastSeries(metricKey, series, options)
  }

  /** Explain a metric's change via candidate contributing factors. */
  rootCause(target: RootCauseInput, candidates: RootCauseInput[]): RootCause {
    return analyzeRootCause(target, candidates)
  }
}

/** Shared singleton intelligence engine. */
export const aiIntelligenceEngine = new AIIntelligenceEngine()
