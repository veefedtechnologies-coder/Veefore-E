/**
 * Veefore Analytics — Legacy bridge public API (interim).
 *
 * Composes the dashboard service against the legacy data bridge so the dashboard
 * API serves real data from the existing analytics collection. Swap to the Mongo
 * rollup store (../db) once connectors emit events into the new pipeline.
 *
 * `MultiPlatformRollupStore` fans out reads to both the Instagram legacy store
 * and the Facebook store, merging results so callers remain platform-agnostic.
 */

import { DashboardService } from '../api'
import { LegacyRollupReadStore, legacyRollupReadStore } from './LegacyRollupReadStore'
import { multiPlatformRollupStore } from './MultiPlatformRollupStore'

export { LegacyRollupReadStore, legacyRollupReadStore }
export { MultiPlatformRollupStore, multiPlatformRollupStore } from './MultiPlatformRollupStore'

/** Dashboard service backed by the multi-platform rollup store (Instagram + Facebook). */
export const legacyDashboardService = new DashboardService({
  readStore: multiPlatformRollupStore,
  seriesStore: multiPlatformRollupStore,
  audienceProvider: multiPlatformRollupStore,
  contentProvider: multiPlatformRollupStore,
})
