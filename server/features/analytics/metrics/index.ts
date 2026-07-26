/**
 * Veefore Analytics — Metric Engine public API (Phase 2).
 *
 * The metric definition + calculation layer: the single source of truth for
 * metric IDs, names, formulas, and derived values across the platform
 * (docs.analytics/analytics/02-metrics-dictionary.md). Backend-only per
 * CODING_RULES Rule 9.
 */

// Models
export type {
  MetricType,
  MetricCategory,
  DataQuality,
  AggregationType,
  MetricUnit,
  Platform,
  ConfidenceLevel,
  RatingBand,
  BenchmarkBand,
  MetricBenchmark,
  MetricDefinition,
  MetricValue,
  CompositeComponent,
} from './types'

// Metric IDs
export { METRIC_IDS, type MetricId } from './metric-ids'

// Registry
export {
  METRIC_DEFINITIONS,
  ALL_METRICS,
  METRIC_SPEC_VERSION,
  getMetricByKey,
  getMetricById,
  getMetricsByCategory,
} from './registry'

// Pure calculations
export * as calculations from './calculations'

// Composite framework
export {
  computeCompositeScore,
  normalizeToScore,
  clamp,
  type CompositeScoreOptions,
} from './composite'

// Engine
export {
  MetricEngine,
  metricEngine,
  rateValue,
  type MetricInputs,
  type MetricContext,
} from './engine'
