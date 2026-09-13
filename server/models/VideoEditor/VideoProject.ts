/**
 * VideoProject — top-level container for an AI video-editing session.
 *
 * Media BYTES always live in object storage (StorageService); this model stores
 * only metadata + references. One project owns many sources, versions, timelines,
 * operations, jobs, and artifacts. Scoped to a workspace for isolation (Req 19).
 */

import mongoose, { Document, Schema, Model } from 'mongoose';

export type VideoProjectStatus = 'active' | 'deleted';

export interface IVideoProject extends Document {
  projectId: string;          // unique, indexed
  userId: string;             // indexed (owner)
  workspaceId: string;        // indexed (isolation)
  name: string;
  activeVersionId?: string;   // current active version
  targetPlatform?: string;
  /** default false — source is retained on delete unless policy permits (Req 20.8) */
  retentionPolicyAllowsSourceDeletion: boolean;
  status: VideoProjectStatus; // indexed
  createdAt: Date;
  updatedAt: Date;
}

const VideoProjectSchema = new Schema<IVideoProject>(
  {
    projectId: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    workspaceId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    activeVersionId: { type: String },
    targetPlatform: { type: String },
    retentionPolicyAllowsSourceDeletion: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['active', 'deleted'],
      default: 'active',
      index: true,
    },
  },
  { timestamps: true }
);

VideoProjectSchema.index({ workspaceId: 1, userId: 1, createdAt: -1 });

export const VideoProjectModel: Model<IVideoProject> =
  (mongoose.models.VideoProject as Model<IVideoProject>) ||
  mongoose.model<IVideoProject>('VideoProject', VideoProjectSchema);

export { VideoProjectSchema };
