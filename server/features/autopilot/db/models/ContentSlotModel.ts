/**
 * Auto Pilot — ContentSlot MongoDB model (collection `autopilot_content_slots`).
 *
 * A Content_Slot is Auto Pilot's planning record for one scheduled post: its
 * time, format, theme, resolved content source, caption/hashtags, linked
 * automation draft, and (once ACT runs) the linked `ContentModel` execution
 * record (design "Data Models" · R2.5).
 *
 * Queried per mission and per workspace; both are indexed. The scheduler and
 * publish guard query by `scheduledAt` and `status`.
 *
 * Satisfies Requirements: 2, 7, 12
 */

import mongoose, { Schema, type Document } from 'mongoose'

export type ContentFormat = 'reel' | 'photo' | 'carousel' | 'story'
export type ContentSourceKind = 'pool' | 'user-brief' | 'ai-generated'
export type ContentSlotStatus =
  | 'planned'
  | 'brief-sent'
  | 'awaiting-approval'
  | 'ready'
  | 'scheduled'
  | 'published'
  | 'rescheduled'
  | 'failed'
  | 'cancelled'
export type FallbackResolution = 'ai-backup' | 'rescheduled'

export interface IContentSlotSource {
  kind: ContentSourceKind
  mediaPoolItemId?: mongoose.Types.ObjectId
}

export interface IContentSlot extends Document {
  missionId: mongoose.Types.ObjectId
  workspaceId: unknown
  scheduledAt: Date
  format: ContentFormat
  theme: string
  source: IContentSlotSource
  caption?: string
  hashtags?: string[]
  automationDraftId?: mongoose.Types.ObjectId
  contentId?: mongoose.Types.ObjectId
  status: ContentSlotStatus
  fallbackResolution?: FallbackResolution
  createdAt: Date
  updatedAt: Date
}

const ContentSlotSourceSchema = new Schema<IContentSlotSource>(
  {
    kind: { type: String, enum: ['pool', 'user-brief', 'ai-generated'], required: true },
    mediaPoolItemId: { type: Schema.Types.ObjectId, ref: 'MediaPoolItem', required: false },
  },
  { _id: false }
)

const ContentSlotSchema = new Schema<IContentSlot>(
  {
    missionId: { type: Schema.Types.ObjectId, ref: 'AutoPilotMission', required: true, index: true },
    workspaceId: { type: Schema.Types.Mixed, required: true, index: true },
    // Within the mission frequency cap (R2.7).
    scheduledAt: { type: Date, required: true },
    format: { type: String, enum: ['reel', 'photo', 'carousel', 'story'], required: true },
    theme: { type: String, required: true },
    source: { type: ContentSlotSourceSchema, required: true },
    caption: { type: String, required: false },
    hashtags: { type: [String], default: undefined },
    automationDraftId: { type: Schema.Types.ObjectId, ref: 'AutomationRule', required: false },
    contentId: { type: Schema.Types.ObjectId, ref: 'Content', required: false },
    status: {
      type: String,
      enum: [
        'planned',
        'brief-sent',
        'awaiting-approval',
        'ready',
        'scheduled',
        'published',
        'rescheduled',
        'failed',
        'cancelled',
      ],
      required: true,
      default: 'planned',
      index: true,
    },
    fallbackResolution: { type: String, enum: ['ai-backup', 'rescheduled'], required: false },
  },
  { timestamps: true }
)

// Planner refresh + scheduler read: a mission's upcoming slots by time.
ContentSlotSchema.index({ missionId: 1, scheduledAt: 1 }, { background: true })
// Publish guard: due slots by status/time within a workspace.
ContentSlotSchema.index({ workspaceId: 1, status: 1, scheduledAt: 1 }, { background: true })

export const ContentSlotModel =
  (mongoose.models.ContentSlot as mongoose.Model<IContentSlot>) ||
  mongoose.model<IContentSlot>('ContentSlot', ContentSlotSchema)
