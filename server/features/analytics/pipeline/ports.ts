/**
 * Veefore Analytics — Pipeline Ports (Phase 7).
 *
 * Storage and logging interfaces the pipeline depends on. These are ports
 * (dependency inversion) implemented with MongoDB in Phase 10; keeping them as
 * interfaces lets the pipeline logic stay pure and unit-testable with in-memory
 * fakes (CODING_RULES Rule 20 SOLID; Rule 21 testability).
 */

import type { AnalyticsEvent } from '../events/types'
import type { MetricRollup } from '../aggregation/types'

/** Persists normalized events and enforces idempotent de-duplication. */
export interface EventStore {
  /** True when an event with this de-dupe key already exists (Ch 10 dedup). */
  exists(dedupeKey: string): Promise<boolean>
  /** Persist a validated event with its de-dupe key. */
  save(event: AnalyticsEvent, dedupeKey: string): Promise<void>
}

/** Upserts aggregated rollups by their (scope, granularity, period) identity. */
export interface RollupStore {
  upsert(rollup: MetricRollup): Promise<void>
}

/**
 * Minimal logging port for pipeline observability (07-data-event-architecture.md
 * Ch 14; CODING_RULES Rule 18 — log failures, never secrets). Defaults to a
 * no-op so the core logic has no hard dependency.
 */
export interface PipelineLogger {
  warn(message: string, meta?: Record<string, unknown>): void
  error(message: string, meta?: Record<string, unknown>): void
}

/** A logger that discards output (safe default for tests / optional wiring). */
export const noopLogger: PipelineLogger = {
  warn: () => {},
  error: () => {},
}
