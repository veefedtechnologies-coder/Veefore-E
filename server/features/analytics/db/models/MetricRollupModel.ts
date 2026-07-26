/**
 * Veefore Analytics — MetricRollup MongoDB model (Phase 10).
 *
 * Persists aggregated rollups (07-data-event-architecture.md Ch 7;
 * 10-database-architecture.md Ch 2/3). A unique compound index on
 * (workspace, platform, account, granularity, periodStart) makes rollups
 * idempotently upsertable. `platform`/`accountId` default to '' so the unique
 * index behaves deterministically for workspace-wide rollups.
 */

import mongoose, { Schema, type Document } from 'mongoose'

export interface IMetricRollup extends Document {
  workspaceId: string
  organizationId?: string
  platform: string
  accountId: string
  granularity: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'lifetime'
  periodStart: Date
  periodEnd: Date
  metrics: Record<string, number>
  eventCount: number
  lastEventAt: Date
  updatedAt: Date
}

const MetricRollupSchema = new Schema<IMetricRollup>({
  workspaceId: { type: String, required: true, index: true },
  organizationId: { type: String, required: false },
  platform: { type: String, required: true, default: '' },
  accountId: { type: String, required: true, default: '' },
  granularity: { type: String, required: true },
  periodStart: { type: Date, required: true },
  periodEnd: { type: Date, required: true },
  metrics: { type: Schema.Types.Mixed, default: {} },
  eventCount: { type: Number, default: 0 },
  lastEventAt: { type: Date, required: true },
  updatedAt: { type: Date, default: Date.now },
})

// One rollup per scope + granularity + period (idempotent upsert identity).
MetricRollupSchema.index(
  { workspaceId: 1, platform: 1, accountId: 1, granularity: 1, periodStart: 1 },
  { unique: true, background: true }
)
// Dashboard read pattern: a workspace's rollups for a granularity over a range.
MetricRollupSchema.index({ workspaceId: 1, granularity: 1, periodStart: -1 }, { background: true })

export const MetricRollupModel =
  (mongoose.models.MetricRollup as mongoose.Model<IMetricRollup>) ||
  mongoose.model<IMetricRollup>('MetricRollup', MetricRollupSchema)
