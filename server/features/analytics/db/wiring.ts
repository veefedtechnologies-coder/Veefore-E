/**
 * Veefore Analytics — MongoDB wiring (Phase 10).
 *
 * Composition of the pure logic (Phases 7–8) with the MongoDB stores. This is
 * the single place that binds ports to their Mongo implementations, keeping the
 * feature's core logic persistence-agnostic (CODING_RULES Rule 20).
 *
 * `db` depends on `api`/`pipeline` (for the service/pipeline classes), but never
 * the reverse — so there is no import cycle. Route registration imports these
 * instances at the composition layer.
 */

import { AnalyticsPipeline } from '../pipeline'
import { DashboardService } from '../api'
import { mongoEventStore } from './MongoEventStore'
import { mongoRollupStore } from './MongoRollupStore'
import { mongoRollupReadStore } from './MongoRollupReadStore'

/** Pipeline bound to the Mongo event + rollup stores (for ingestion jobs). */
export const analyticsPipeline = new AnalyticsPipeline({
  eventStore: mongoEventStore,
  rollupStore: mongoRollupStore,
})

/** Dashboard service reading from the Mongo rollup store (serves the API). */
export const mongoDashboardService = new DashboardService({ readStore: mongoRollupReadStore })
