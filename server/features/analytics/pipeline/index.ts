/**
 * Veefore Analytics — Pipeline module public API (Phase 7).
 *
 * Ingestion + aggregation orchestration and its storage/logging ports
 * (07-data-event-architecture.md Ch 1; 08-backend-api-architecture.md Ch 2).
 */

export {
  AnalyticsPipeline,
  DEFAULT_ROLLUP_GRANULARITIES,
  type AnalyticsPipelineDeps,
  type IngestResult,
} from './pipeline'
export {
  type EventStore,
  type RollupStore,
  type PipelineLogger,
  noopLogger,
} from './ports'
