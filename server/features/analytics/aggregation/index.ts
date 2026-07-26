/**
 * Veefore Analytics — Aggregation module public API (Phase 7).
 *
 * Multi-granularity rollups derived from normalized events
 * (07-data-event-architecture.md Ch 7).
 */

export type { MetricRollup, RollupGranularity } from './types'
export { rollupEvents, getPeriodStart, type MetricEvent } from './rollup'
