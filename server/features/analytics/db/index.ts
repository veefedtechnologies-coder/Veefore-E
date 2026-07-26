/**
 * Veefore Analytics — Database module public API (Phase 10).
 *
 * MongoDB models, port implementations, and the composed Mongo-backed instances
 * (10-database-architecture.md). Server-only.
 */

// Models
export { AnalyticsEventModel, type IAnalyticsEvent } from './models/AnalyticsEventModel'
export { MetricRollupModel, type IMetricRollup } from './models/MetricRollupModel'

// Port implementations
export { MongoEventStore, mongoEventStore } from './MongoEventStore'
export { MongoRollupStore, mongoRollupStore } from './MongoRollupStore'
export { MongoRollupReadStore, mongoRollupReadStore } from './MongoRollupReadStore'

// Composed instances
export { analyticsPipeline, mongoDashboardService } from './wiring'
