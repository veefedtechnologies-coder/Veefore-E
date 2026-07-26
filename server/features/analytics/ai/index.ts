/**
 * Veefore Analytics — AI Intelligence module public API (Phase 11).
 *
 * Deterministic, evidence-based intelligence: forecasting, trend/anomaly
 * detection, root-cause analysis, recommendations, and executive summaries
 * (11-ai-intelligence-engine.md). Backend-only; consumes metrics, not platform
 * APIs.
 */

export type {
  SeriesPoint,
  TrendDirection,
  TrendSignal,
  Anomaly,
  ForecastPoint,
  Forecast,
  ContributingFactor,
  RootCause,
  AIInsight,
  AIRecommendation,
  ExecutiveSummary,
  ConfidenceInput,
} from './types'

export { deriveConfidence } from './confidence'
export { linearRegression, mean, stdDev, type RegressionResult } from './stats'
export { forecastSeries, type ForecastOptions } from './forecast'
export { detectTrend, detectAnomalies } from './signals'
export { analyzeRootCause, type RootCauseInput } from './root-cause'
export { buildRecommendations, type RecommendationOptions } from './recommendations'
export { buildExecutiveSummary } from './executive-summary'
export {
  AIIntelligenceEngine,
  aiIntelligenceEngine,
  type AnalyzeInput,
  type AnalysisResult,
} from './engine'
