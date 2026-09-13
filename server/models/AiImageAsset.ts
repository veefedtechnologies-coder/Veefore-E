/**
 * AiImageAsset — metadata for an AI-generated / AI-edited image.
 *
 * The image BYTES live in object storage (StorageService); MongoDB stores only
 * metadata + the storage URL, plus the editing lineage (sourceAssetId + session)
 * so multi-turn editing keeps a version history without losing earlier results.
 */

import mongoose, { Schema, type Document } from 'mongoose'

export type ImageOperation = 'generation' | 'editing' | 'variation'

export interface IAiImageAsset extends Document {
  assetId: string
  workspaceId?: string
  userId?: string
  conversationId?: number
  /** Groups all versions of one editing thread. */
  sessionId: string
  /** The asset this one was derived from (for edits), if any. */
  sourceAssetId?: string
  operation: ImageOperation
  provider: string
  model: string
  /** The instruction/brief used (may be omitted per privacy config). */
  instruction?: string
  mimeType: string
  storageKey: string
  storageUrl: string
  width?: number
  height?: number
  aspectRatio?: string
  creditsUsed?: number
  createdAt: Date
}

const AiImageAssetSchema = new Schema<IAiImageAsset>({
  assetId: { type: String, required: true, unique: true, index: true },
  workspaceId: { type: String, index: true },
  userId: { type: String, index: true },
  conversationId: { type: Number },
  sessionId: { type: String, index: true },
  sourceAssetId: { type: String },
  operation: { type: String, enum: ['generation', 'editing', 'variation'], required: true },
  provider: { type: String, default: 'gemini' },
  model: { type: String, required: true },
  instruction: { type: String },
  mimeType: { type: String, default: 'image/png' },
  storageKey: { type: String, required: true },
  storageUrl: { type: String, required: true },
  width: { type: Number },
  height: { type: Number },
  aspectRatio: { type: String },
  creditsUsed: { type: Number },
  createdAt: { type: Date, default: Date.now },
})

export const AiImageAsset =
  (mongoose.models.AiImageAsset as mongoose.Model<IAiImageAsset>) ||
  mongoose.model<IAiImageAsset>('AiImageAsset', AiImageAssetSchema)
