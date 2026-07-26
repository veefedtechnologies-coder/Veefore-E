/**
 * Veefore Analytics — Aggregation Types (Phase 7).
 *
 * Rollup shapes for the multi-granularity aggregation layer
 * (07-data-event-architecture.md Ch 7; 10-database-architecture.md Ch 3).
 * Dashboards read from the appropriate rollup rather than scanning raw events.
 */

import type { Platform } from '../metrics'

/** Rollup time granularities (07-data-event-architecture.md Ch 7). */
export type RollupGranularity = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'lifetime'

/**
 * An aggregated metric rollup for one scope (workspace/platform/account) and one
 * time bucket. `metrics` holds raw/aggregated values keyed by canonical metric
 * key; derived metrics are computed on read by the metric engine (ADR-004).
 */
export interface MetricRollup {
  workspaceId: string
  organizationId?: string
  platform?: Platform
  accountId?: string
  granularity: RollupGranularity
  /** Bucket start, ISO-8601 UTC (inclusive). */
  periodStart: string
  /** Bucket end, ISO-8601 UTC (exclusive), or last event time for lifetime. */
  periodEnd: string
  /** Aggregated values by canonical metric key. */
  metrics: Record<string, number>
  /** Number of source events aggregated into this bucket. */
  eventCount: number
  /** Timestamp of the most recent source event. */
  lastEventAt: string
}
