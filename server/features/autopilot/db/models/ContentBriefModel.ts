/**
 * Auto Pilot — ContentBrief MongoDB model (collection `autopilot_content_briefs`).
 *
 * A Content_Brief is the just-in-time creative package Auto Pilot sends the user
 * when a slot needs their media: concept, hook, shot list, step-by-step
 * instructions, and a suggested caption in the mission's local language
 * (design "Data Models" · R7, R9.3). It tracks lead-time, send/fallback
 * deadlines, reminder count (≤3, R7.5), and delivery status.
 *
 * Queried per mission/slot and per workspace; the brief worker reads due briefs
 * by `sendAt`/`fallbackDeadline` and `status`.
 *
 * Satisfies Requirements: 7, 9
 */

import mongoose, { Schema, type Document } from 'mongoose'

export type ContentBriefStatus =
  | 'pending'
  | 'sent'
  | 'delivered'
  | 'ai-backup'
  | 'rescheduled'
  | 'failed'

export interface IContentBrief extends Document {
  missionId: mongoose.Types.ObjectId
  slotId: mongoose.Types.ObjectId
  workspaceId: unknown
  concept: string
  hook: string
  shotList: string[]
  instructions: string
  suggestedCaption: string
  language: string
  leadTimeMs: number
  sendAt: Date
  fallbackDeadline: Date
  remindersSent: number
  status: ContentBriefStatus
  deliveredMediaPoolItemId?: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const ContentBriefSchema = new Schema<IContentBrief>(
  {
    missionId: { type: Schema.Types.ObjectId, ref: 'AutoPilotMission', required: true, index: true },
    slotId: { type: Schema.Types.ObjectId, ref: 'ContentSlot', required: true, index: true },
    workspaceId: { type: Schema.Types.Mixed, required: true, index: true },
    concept: { type: String, required: true },
    hook: { type: String, required: true },
    shotList: { type: [String], default: [] },
    instructions: { type: String, required: true },
    suggestedCaption: { type: String, required: true },
    // R9.3: brief authored in the mission's local language.
    language: { type: String, required: true },
    leadTimeMs: { type: Number, required: true, min: 0 },
    // R7.3: send at publishTime − leadTime.
    sendAt: { type: Date, required: true },
    // R7.6: fallback deadline (publishTime − 30m) for undelivered briefs.
    fallbackDeadline: { type: Date, required: true },
    // R7.5: at most 3 escalating reminders.
    remindersSent: { type: Number, required: true, default: 0, min: 0, max: 3 },
    status: {
      type: String,
      enum: ['pending', 'sent', 'delivered', 'ai-backup', 'rescheduled', 'failed'],
      required: true,
      default: 'pending',
      index: true,
    },
    deliveredMediaPoolItemId: { type: Schema.Types.ObjectId, ref: 'MediaPoolItem', required: false },
  },
  { timestamps: true }
)

// Brief worker: due sends/reminders for a workspace by time + status.
ContentBriefSchema.index({ workspaceId: 1, status: 1, sendAt: 1 }, { background: true })
ContentBriefSchema.index({ workspaceId: 1, status: 1, fallbackDeadline: 1 }, { background: true })

export const ContentBriefModel =
  (mongoose.models.ContentBrief as mongoose.Model<IContentBrief>) ||
  mongoose.model<IContentBrief>('ContentBrief', ContentBriefSchema)
