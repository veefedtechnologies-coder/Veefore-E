/**
 * Veefore Analytics — AnalyticsEvent MongoDB model (Phase 10).
 *
 * Persists the normalized event envelope (07-data-event-architecture.md Ch 4;
 * 10-database-architecture.md Ch 2 "Analytics Events"). A unique `dedupeKey`
 * index enforces idempotent ingestion (Ch 10 dedup). Indexes prioritize
 * workspace/platform/account/time/event-type queries (10-database Ch 6).
 */

import mongoose, { Schema, type Document } from 'mongoose'

export interface IAnalyticsEvent extends Document {
  eventId: string
  eventName: string
  eventVersion: number
  eventTimestamp: Date
  workspaceId: string
  organizationId?: string
  userId?: string
  platform?: string
  accountId?: string
  source: string
  status: 'pending' | 'success' | 'failed'
  traceId?: string
  dataQuality?: string
  payload: Record<string, unknown>
  metadata?: Record<string, unknown>
  /** Stable de-duplication key (unique). */
  dedupeKey: string
  createdAt: Date
}

const AnalyticsEventSchema = new Schema<IAnalyticsEvent>({
  eventId: { type: String, required: true, unique: true },
  eventName: { type: String, required: true, index: true },
  eventVersion: { type: Number, required: true, default: 1 },
  eventTimestamp: { type: Date, required: true, index: true },
  workspaceId: { type: String, required: true, index: true },
  organizationId: { type: String, required: false },
  userId: { type: String, required: false },
  platform: { type: String, required: false, index: true },
  accountId: { type: String, required: false, index: true },
  source: { type: String, required: true },
  status: { type: String, required: true, default: 'success' },
  traceId: { type: String, required: false },
  dataQuality: { type: String, required: false },
  payload: { type: Schema.Types.Mixed, default: {} },
  metadata: { type: Schema.Types.Mixed, default: {} },
  dedupeKey: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now },
})

// Time-range queries scoped to a workspace/platform/account (10-database Ch 6, 8).
AnalyticsEventSchema.index({ workspaceId: 1, platform: 1, accountId: 1, eventTimestamp: -1 }, { background: true })
AnalyticsEventSchema.index({ workspaceId: 1, eventName: 1, eventTimestamp: -1 }, { background: true })

export const AnalyticsEventModel =
  (mongoose.models.AnalyticsEvent as mongoose.Model<IAnalyticsEvent>) ||
  mongoose.model<IAnalyticsEvent>('AnalyticsEvent', AnalyticsEventSchema)
