/**
 * Veefore Analytics Feature Module (server) — public API.
 *
 * Backend home for the enterprise Analytics module. Phase 2 introduces the
 * Metric Engine (definitions, IDs, calculations); later phases add events,
 * aggregation, dashboard APIs, and AI intelligence
 * (docs.analytics/analytics/IMPLEMENTATION_ORDER.md).
 */

export * from './metrics'
export * from './events'
export * from './aggregation'
export * from './pipeline'
export * from './api'
export * from './ai'
