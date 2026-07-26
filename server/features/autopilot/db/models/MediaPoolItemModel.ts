/**
 * Auto Pilot — MediaPoolItem MongoDB model (collection `autopilot_media_pool`).
 *
 * The Media Pool is Auto Pilot's workspace-scoped store of reusable media
 * (user uploads, AI-generated backups, brief deliveries). Items stay available
 * for reuse across the workspace's missions until the user removes them
 * (design "Data Models" · R6). Accepted uploads are ≤100MB image/video (R6.5).
 *
 * All queries are `workspaceId`-scoped, so `workspaceId` is indexed; the
 * resolver reads available items per workspace.
 *
 * Satisfies Requirements: 6
 */

import mongoose, { Schema, type Document } from 'mongoose'

export type MediaOrigin = 'user-upload' | 'ai-generated' | 'brief-delivery'
export type MediaType = 'image' | 'video'

export interface IMediaPoolItem extends Document {
  workspaceId: unknown
  missionId?: mongoose.Types.ObjectId
  origin: MediaOrigin
  mediaUrl: string
  mediaType: MediaType
  format?: string
  sizeBytes: number
  visionAnalysis?: Record<string, unknown>
  available: boolean
  usedInSlots: mongoose.Types.ObjectId[]
  createdAt: Date
  updatedAt: Date
}

const MediaPoolItemSchema = new Schema<IMediaPoolItem>(
  {
    // The pool is workspace-scoped and reusable across that workspace's missions.
    workspaceId: { type: Schema.Types.Mixed, required: true, index: true },
    missionId: { type: Schema.Types.ObjectId, ref: 'AutoPilotMission', required: false },
    origin: {
      type: String,
      enum: ['user-upload', 'ai-generated', 'brief-delivery'],
      required: true,
    },
    mediaUrl: { type: String, required: true },
    mediaType: { type: String, enum: ['image', 'video'], required: true },
    format: { type: String, required: false },
    // R6.5: uploads accepted up to 100MB.
    sizeBytes: { type: Number, required: true, min: 0, max: 100 * 1024 * 1024 },
    // Cached analyzeMedia() output for vision-grounded captioning.
    visionAnalysis: { type: Schema.Types.Mixed, required: false },
    // R6.6: reusable until the user removes it.
    available: { type: Boolean, required: true, default: true, index: true },
    usedInSlots: { type: [Schema.Types.ObjectId], default: [] },
  },
  { timestamps: true }
)

// Resolver read pattern: available items for a workspace (optionally per mission).
MediaPoolItemSchema.index({ workspaceId: 1, available: 1 }, { background: true })
MediaPoolItemSchema.index({ workspaceId: 1, missionId: 1 }, { background: true })

export const MediaPoolItemModel =
  (mongoose.models.MediaPoolItem as mongoose.Model<IMediaPoolItem>) ||
  mongoose.model<IMediaPoolItem>('MediaPoolItem', MediaPoolItemSchema)
