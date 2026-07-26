/**
 * Veefore Analytics — MongoRollupStore (Phase 10).
 *
 * MongoDB implementation of the pipeline {@link RollupStore} port. Upserts a
 * rollup by its (scope, granularity, period) identity. The write REPLACES the
 * bucket's aggregated values, so callers must aggregate the FULL set of events
 * for a bucket (the documented recompute model, ADR-004) rather than partial
 * batches, to avoid losing earlier events in the same period.
 */

import type { MetricRollup } from '../aggregation'
import type { RollupStore } from '../pipeline'
import { MetricRollupModel } from './models/MetricRollupModel'

export class MongoRollupStore implements RollupStore {
  async upsert(rollup: MetricRollup): Promise<void> {
    const platform = rollup.platform ?? ''
    const accountId = rollup.accountId ?? ''
    await MetricRollupModel.updateOne(
      {
        workspaceId: rollup.workspaceId,
        platform,
        accountId,
        granularity: rollup.granularity,
        periodStart: new Date(rollup.periodStart),
      },
      {
        $set: {
          organizationId: rollup.organizationId,
          periodEnd: new Date(rollup.periodEnd),
          metrics: rollup.metrics,
          eventCount: rollup.eventCount,
          lastEventAt: new Date(rollup.lastEventAt),
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    )
  }
}

export const mongoRollupStore = new MongoRollupStore()
