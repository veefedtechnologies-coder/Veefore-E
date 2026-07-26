/**
 * Veefore Analytics — MongoRollupReadStore (Phase 10).
 *
 * MongoDB implementation of the API {@link RollupReadStore} port. Reads rollups
 * for a workspace/granularity/window, optionally filtered by platform/account
 * (08-backend-api-architecture.md Ch 4; queries hit the compound rollup index).
 */

import type { MetricRollup, RollupGranularity } from '../aggregation'
import type { RollupReadStore, RollupReadQuery } from '../api'
import type { Platform } from '../metrics'
import { MetricRollupModel, type IMetricRollup } from './models/MetricRollupModel'

/** Map a persisted rollup document to the contract-shaped {@link MetricRollup}. */
function toRollup(doc: IMetricRollup): MetricRollup {
  return {
    workspaceId: doc.workspaceId,
    organizationId: doc.organizationId,
    platform: (doc.platform || undefined) as Platform | undefined,
    accountId: doc.accountId || undefined,
    granularity: doc.granularity as RollupGranularity,
    periodStart: doc.periodStart.toISOString(),
    periodEnd: doc.periodEnd.toISOString(),
    metrics: (doc.metrics ?? {}) as Record<string, number>,
    eventCount: doc.eventCount,
    lastEventAt: doc.lastEventAt.toISOString(),
  }
}

export class MongoRollupReadStore implements RollupReadStore {
  async getRollups(query: RollupReadQuery): Promise<MetricRollup[]> {
    const filter: Record<string, unknown> = {
      workspaceId: query.workspaceId,
      granularity: query.granularity,
    }
    if (query.platforms && query.platforms.length) filter.platform = { $in: query.platforms }
    if (query.accountIds && query.accountIds.length) filter.accountId = { $in: query.accountIds }

    if (query.from || query.to) {
      const range: Record<string, Date> = {}
      if (query.from) range.$gte = new Date(query.from)
      if (query.to) range.$lt = new Date(query.to)
      filter.periodStart = range
    }

    const docs = await MetricRollupModel.find(filter).sort({ periodStart: 1 }).lean<IMetricRollup[]>()
    return docs.map(toRollup)
  }
}

export const mongoRollupReadStore = new MongoRollupReadStore()
