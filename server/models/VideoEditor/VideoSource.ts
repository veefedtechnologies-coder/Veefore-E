/**
 * VideoSource — immutable original source media accepted into a project.
 *
 * The original BYTES live in StorageService under video-editor/{projectId}/original/
 * and are never overwritten (Req 3.6, 20.4). This model stores probe metadata + the
 * storage key only.
 */

import mongoose, { Document, Schema, Model } from 'mongoose';

export interface IVideoSource extends Document {
  sourceId: string;           // unique, indexed
  projectId: string;          // indexed
  workspaceId: string;        // indexed
  userId: string;             // indexed
  storageKey: string;         // original bytes in StorageService (folder original/)
  container: string;
  mimeType: string;
  sizeBytes: number;
  durationMs: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  immutable: boolean;         // always true — never overwritten (Req 3.6, 20.4)
  createdAt: Date;
  updatedAt: Date;
}

const VideoSourceSchema = new Schema<IVideoSource>(
  {
    sourceId: { type: String, required: true, unique: true, index: true },
    projectId: { type: String, required: true, index: true },
    workspaceId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    storageKey: { type: String, required: true },
    container: { type: String, required: true },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    durationMs: { type: Number, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    fps: { type: Number, required: true },
    codec: { type: String, required: true },
    immutable: { type: Boolean, default: true },
  },
  { timestamps: true }
);

VideoSourceSchema.index({ projectId: 1, createdAt: -1 });

export const VideoSourceModel: Model<IVideoSource> =
  (mongoose.models.VideoSource as Model<IVideoSource>) ||
  mongoose.model<IVideoSource>('VideoSource', VideoSourceSchema);

export { VideoSourceSchema };
