/**
 * Veefore Analytics — AI Intelligence Types (Phase 11).
 *
 * Types for the deterministic, evidence-based intelligence engine
 * (11-ai-intelligence-engine.md). Every AI output carries a confidence level and
 * references the metrics that support it; nothing is fabricated (CODING_RULES
 * Rule 16). Forecasts are clearly separated from observed facts (Ch 15 safety).
 */

import type { ConfidenceLevel, DataQuality } from '../metrics'

/** A single time-series observation of a metric. */
export interface SeriesPoint {
  /** ISO-8601 timestamp of the observation. */
  t: string
  value: number
}

/** Direction of a detected trend. */
export type TrendDirection = 'rising' | 'falling' | 'flat'

/** A detected trend for a metric over a series. */
export interface TrendSignal {
  metricKey: string
  direction: TrendDirection
  /** Slope per period from the regression fit. */
  slope: number
  /** Percentage change from first to last observation. */
  changePercent: number | null
  confidence: ConfidenceLevel
}

/** An anomalous observation flagged against the series' expected value. */
export interface Anomaly {
  metricKey: string
  index: number
  value: number
  expected: number
  zScore: number
  severity: 'low' | 'medium' | 'high'
}

/** A single forecasted future point with a prediction interval. */
export interface ForecastPoint {
  value: number
  lower: number
  upper: number
}

/** A forecast for a metric (11-ai-intelligence-engine.md Ch 6). */
export interface Forecast {
  metricKey: string
  /** Number of periods projected. */
  horizon: number
  predictions: ForecastPoint[]
  confidence: ConfidenceLevel
  /** Deterministic method used (facts vs. prediction transparency, Ch 14). */
  method: 'linear_regression'
  /** Assumptions the forecast relies on. */
  assumptions: string[]
}

/** A candidate contributing factor in a root-cause analysis. */
export interface ContributingFactor {
  metricKey: string
  changePercent: number | null
  direction: TrendDirection
  note: string
}

/** Root-cause analysis of a metric's change (Ch 4). */
export interface RootCause {
  metricKey: string
  changePercent: number | null
  direction: TrendDirection
  factors: ContributingFactor[]
  /** Explicit caveat — correlation is not causation (Ch 15). */
  caveat: string
}

/** An AI insight: an opportunity or a risk (Ch 10, 11). */
export interface AIInsight {
  id: string
  kind: 'opportunity' | 'risk'
  title: string
  explanation: string
  confidence: ConfidenceLevel
  /** Metric keys that support this insight (evidence — required). */
  supportingMetricKeys: string[]
}

/** An actionable recommendation (Ch 5). */
export interface AIRecommendation {
  id: string
  title: string
  explanation: string
  expectedBenefit: string
  difficulty: 'low' | 'medium' | 'high'
  confidence: ConfidenceLevel
  supportingMetricKeys: string[]
}

/** The executive summary of a dashboard (Ch 3). */
export interface ExecutiveSummary {
  text: string
  confidence: ConfidenceLevel
  supportingMetricKeys: string[]
}

/** Inputs used to derive confidence for a signal (Ch 13). */
export interface ConfidenceInput {
  /** Number of data points behind the signal. */
  points: number
  /** Goodness of fit (0–1), where available. */
  rSquared?: number
  /** Provenance of the underlying data. */
  dataQuality?: DataQuality
}
