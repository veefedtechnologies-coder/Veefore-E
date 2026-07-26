/**
 * Veefore Analytics — Backend API module public API (Phase 8).
 *
 * Dashboard-oriented endpoints, response contracts, query model, caching, the
 * dashboard service, and background jobs (08-backend-api-architecture.md).
 */

// Contracts
export {
  ANALYTICS_CONTRACT_VERSION,
  type DashboardResponse,
  type DashboardMeta,
  type KpiContract,
  type WidgetContract,
  type ChartSeriesContract,
  type TimeseriesWidgetData,
  type DistributionWidgetData,
  type TopListWidgetData,
  type AlertContract,
  type RecommendationContract,
  type ContractTrend,
} from './contracts'

// Query
export { AnalyticsQuerySchema, parseAnalyticsQuery, type AnalyticsQuery } from './query'

// Read-store port
export {
  EmptyRollupReadStore,
  type RollupReadStore,
  type RollupReadQuery,
  type SeriesReadStore,
  type DailySeriesPoint,
  type AudienceProvider,
  type ContentProvider,
  type DistributionSlice,
  type TopItem,
} from './ports'

// Cache
export {
  InMemoryTtlCache,
  dashboardCacheKey,
  queryFingerprint,
  type AnalyticsCache,
} from './cache'
export { RedisAnalyticsCache } from './RedisAnalyticsCache'

// Dashboard specs & service
export { ANALYTICS_DASHBOARD_SPECS, getDashboardSpec, type DashboardSpec } from './dashboard-specs'
export {
  DashboardService,
  dashboardService,
  UnknownDashboardError,
  type DashboardServiceDeps,
} from './dashboard.service'

// Routes
export { createDashboardRouter, dashboardApiRouter, type DashboardRouterDeps } from './routes'

// Jobs
export {
  ANALYTICS_JOB_TYPES,
  runAnalyticsJob,
  runAggregationRefresh,
  runCacheInvalidation,
  type AnalyticsJob,
  type AnalyticsJobType,
  type AnalyticsJobDeps,
  type AnalyticsJobResult,
} from './workers/jobs'
