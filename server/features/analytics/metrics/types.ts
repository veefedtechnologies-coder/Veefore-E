/**
 * Veefore Analytics — Metric Models (Phase 2: Metric Engine).
 *
 * Type definitions modeling the "Universal Metric Structure" and metric
 * specification template from the Metrics Dictionary
 * (docs.analytics/analytics/02-metrics-dictionary.md, Ch 2 & Ch 9).
 *
 * These types are the single source of truth for how every metric is described
 * across the platform. Metric calculation lives on the backend only
 * (CODING_RULES Rule 9); the frontend consumes computed values via contracts.
 */

/**
 * The five-tier metric hierarchy (02-metrics-dictionary.md Ch 1):
 * Raw → Calculated → Composite → AI → Business.
 */
export type MetricType = 'raw' | 'calculated' | 'composite' | 'ai' | 'business'

/** Metric domain categories (02-metrics-dictionary.md Ch 3). */
export type MetricCategory =
  | 'account'
  | 'audience'
  | 'reach'
  | 'impression'
  | 'engagement'
  | 'video'
  | 'story'
  | 'publishing'
  | 'automation'
  | 'campaign'
  | 'revenue'
  | 'composite'
  | 'ai'
  | 'business'

/**
 * Data quality / provenance label (02-metrics-dictionary.md Ch 7, Ch 9;
 * 07-data-event-architecture.md Ch 9). Every metric value must expose one so the
 * UI can distinguish facts from estimates and predictions (CODING_RULES Rule 16).
 */
export type DataQuality = 'verified' | 'calculated' | 'estimated' | 'predicted'

/** How a metric is aggregated over a time window. */
export type AggregationType =
  | 'latest'
  | 'sum'
  | 'average'
  | 'min'
  | 'max'
  | 'count'
  | 'rate'
  | 'none'

/** Unit of a metric's value, used for formatting and benchmark comparison. */
export type MetricUnit =
  | 'count'
  | 'percent'
  | 'ratio'
  | 'currency'
  | 'seconds'
  | 'score'
  | 'per_hour'

/** Supported platforms (analytics/README.md Supported Platforms). */
export type Platform =
  | 'instagram'
  | 'facebook'
  | 'youtube'
  | 'linkedin'
  | 'threads'
  | 'tiktok'
  | 'pinterest'
  | 'google_business'

/** AI/analytics confidence label (11-ai-intelligence-engine.md Ch 13). */
export type ConfidenceLevel = 'very_high' | 'high' | 'medium' | 'low'

/**
 * Qualitative rating band for a metric value relative to its benchmark
 * (02-metrics-dictionary.md Ch 9: Excellent/Good/Average/Poor/Critical).
 */
export type RatingBand = 'excellent' | 'good' | 'average' | 'poor' | 'critical'

/**
 * A single benchmark band expressed as an inclusive `[min, max]` range in the
 * metric's own unit. Ranges are interpreted independently of direction; whether
 * a higher value is better is expressed by {@link MetricDefinition.higherIsBetter}.
 */
export interface BenchmarkBand {
  min: number
  max: number
}

/**
 * Benchmark definition for a metric. Any subset of bands may be provided; the
 * industry average is optional context.
 */
export interface MetricBenchmark {
  industryAverage?: number
  excellent?: BenchmarkBand
  good?: BenchmarkBand
  average?: BenchmarkBand
  poor?: BenchmarkBand
  critical?: BenchmarkBand
}

/**
 * The definition of a metric — the durable specification consumed by the metric
 * engine, dashboards, reports, exports, and AI (02-metrics-dictionary.md Ch 2,
 * Ch 4 naming, Ch 5 IDs, Ch 9 template). A trimmed, implementation-focused
 * subset of the full documentation template; optional fields carry the rest.
 */
export interface MetricDefinition {
  /** Permanent, immutable metric ID, format `MTR-NNNNNN` (Ch 5). */
  id: string
  /**
   * Canonical internal key — the ONE name used across DB, API, frontend, and AI
   * (Ch 4 Metric Naming Standards), e.g. `followers_total`.
   */
  key: string
  /** Human-readable metric name, e.g. "Followers". */
  name: string
  /** Optional distinct display name; defaults to {@link name}. */
  displayName?: string
  /** One-line description of what the metric measures. */
  description: string
  category: MetricCategory
  type: MetricType
  /** Default data-quality label for values of this metric. */
  dataQuality: DataQuality
  unit: MetricUnit
  aggregation: AggregationType
  /** Platforms that support this metric, or `'all'`. */
  platforms: Platform[] | 'all'
  /** Human-readable formula text (documentation/lineage aid). */
  formula?: string
  /** Canonical keys of metrics this metric is derived from (lineage, Ch 8). */
  dependencies?: string[]
  /** Benchmark bands for qualitative rating. */
  benchmark?: MetricBenchmark
  /** Whether a higher value is better (drives trend/rating direction). */
  higherIsBetter?: boolean
  /** Spec version of this definition. */
  version: string
}

/**
 * A computed metric value with full provenance, produced by the metric engine.
 * Presentation-agnostic so any dashboard/report/AI surface can consume it.
 */
export interface MetricValue {
  /** The metric ID this value corresponds to. */
  metricId: string
  /** Canonical key (mirror of the definition key for convenience). */
  key: string
  /**
   * The numeric value, or `null` when it cannot be computed (missing inputs,
   * division by zero, unsupported). Never fabricate a value (Rule 16).
   */
  value: number | null
  unit: MetricUnit
  /** Provenance of this specific value. */
  dataQuality: DataQuality
  /** Rating band vs. the metric benchmark, when a benchmark is defined. */
  rating?: RatingBand
  /** Canonical keys of the inputs used, for explainability/lineage. */
  lineage?: string[]
}

/** A single weighted component feeding a composite score. */
export interface CompositeComponent {
  /** Canonical key of the contributing metric. */
  key: string
  /** Normalized 0–100 sub-score for this component. */
  score: number
  /** Relative weight (need not be pre-normalized; the engine normalizes). */
  weight: number
}
