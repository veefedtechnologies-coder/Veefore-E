/**
 * Veefore Analytics — Background Jobs (Phase 8).
 *
 * Definitions and handlers for analytics background work
 * (08-backend-api-architecture.md Ch 7): heavy tasks run asynchronously and
 * never block API responses. Handlers are dependency-injected so they stay
 * testable and decoupled from the queue implementation (which the existing
 * TieredJobScheduler / queue infrastructure provides).
 */

import { AnalyticsPipeline } from '../../pipeline'
import type { AnalyticsEventInput } from '../../events'
import type { AnalyticsCache } from '../cache'
import type { PipelineLogger } from '../../pipeline'
import { noopLogger } from '../../pipeline'

/** Analytics background job types (08-backend-api-architecture.md Ch 7). */
export const ANALYTICS_JOB_TYPES = {
  AGGREGATION_REFRESH: 'analytics.aggregation_refresh',
  CACHE_INVALIDATION: 'analytics.cache_invalidation',
  FORECAST_GENERATION: 'analytics.forecast_generation',
  REPORT_GENERATION: 'analytics.report_generation',
  BENCHMARK_UPDATE: 'analytics.benchmark_update',
} as const

export type AnalyticsJobType = (typeof ANALYTICS_JOB_TYPES)[keyof typeof ANALYTICS_JOB_TYPES]

/** A unit of analytics background work. */
export interface AnalyticsJob {
  type: AnalyticsJobType
  workspaceId: string
  payload?: Record<string, unknown>
}

/** Result of running a job (tracked with status/retry by the queue, Ch 7). */
export interface AnalyticsJobResult {
  ok: boolean
  message?: string
}

/** Collaborators injected into job handlers. */
export interface AnalyticsJobDeps {
  pipeline?: AnalyticsPipeline
  cache?: AnalyticsCache
  logger?: PipelineLogger
}

/**
 * Aggregation refresh: ingest a batch of events and rebuild rollups, then
 * invalidate the workspace's cached dashboards so the next request is fresh
 * (Ch 6 "invalidate cache after successful syncs").
 */
export async function runAggregationRefresh(
  job: AnalyticsJob & { payload?: { events?: AnalyticsEventInput<Record<string, number>>[] } },
  deps: AnalyticsJobDeps
): Promise<AnalyticsJobResult> {
  const logger = deps.logger ?? noopLogger
  const pipeline = deps.pipeline
  if (!pipeline) return { ok: false, message: 'No pipeline configured' }

  const events = job.payload?.events ?? []
  const { ingest, rollups } = await pipeline.ingestAndAggregate(events)

  if (deps.cache) {
    await deps.cache.invalidate(`analytics:${job.workspaceId}:`)
  }

  logger.warn('analytics.job: aggregation refresh complete', {
    workspaceId: job.workspaceId,
    accepted: ingest.accepted.length,
    rejected: ingest.rejected.length,
    duplicates: ingest.duplicates,
    rollups: rollups.length,
  })

  return { ok: true, message: `Aggregated ${rollups.length} rollups` }
}

/** Invalidate a workspace's cached dashboards (e.g. after a manual re-sync). */
export async function runCacheInvalidation(
  job: AnalyticsJob,
  deps: AnalyticsJobDeps
): Promise<AnalyticsJobResult> {
  if (!deps.cache) return { ok: false, message: 'No cache configured' }
  await deps.cache.invalidate(`analytics:${job.workspaceId}:`)
  return { ok: true }
}

/**
 * Dispatch a job to its handler. Forecast/report/benchmark handlers are wired in
 * their respective phases (11 / reports); dispatching them now is a safe no-op.
 */
export async function runAnalyticsJob(
  job: AnalyticsJob,
  deps: AnalyticsJobDeps
): Promise<AnalyticsJobResult> {
  switch (job.type) {
    case ANALYTICS_JOB_TYPES.AGGREGATION_REFRESH:
      return runAggregationRefresh(job, deps)
    case ANALYTICS_JOB_TYPES.CACHE_INVALIDATION:
      return runCacheInvalidation(job, deps)
    default:
      return { ok: false, message: `Handler for ${job.type} not yet implemented` }
  }
}
