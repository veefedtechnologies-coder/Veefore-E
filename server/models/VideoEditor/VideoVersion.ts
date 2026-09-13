/**
 * VideoVersion — immutable snapshot of a project's edit state.
 *
 * Each conversational refinement creates a new version derived from a parent
 * (or the active version). Prior versions are preserved unchanged and their
 * lineage recorded (Req 16.4, 16.5, 16.6). Versions are immutable after creation.
 */

import mongoose, { Document, Schema, Model } from 'mongoose';

export interface IVideoVersion extends Document {
  versionId: string;               // unique, indexed
  projectId: string;               // indexed
  parentVersionId: string | null;  // lineage (Req 16.6)
  workspaceId: string;             // indexed
  userId: string;                  // indexed
  timelineId: string;              // snapshot of timeline model
  label?: string;
  createdAt: Date;                 // immutable after creation (Req 16.4, 16.5)
  updatedAt: Date;
}

const VideoVersionSchema = new Schema<IVideoVersion>(
  {
    versionId: { type: String, required: true, unique: true, index: true },
    projectId: { type: String, required: true, index: true },
    parentVersionId: { type: String, default: null },
    workspaceId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    timelineId: { type: String, required: true },
    label: { type: String },
  },
  { timestamps: true }
);

VideoVersionSchema.index({ projectId: 1, createdAt: 1 });

export const VideoVersionModel: Model<IVideoVersion> =
  (mongoose.models.VideoVersion as Model<IVideoVersion>) ||
  mongoose.model<IVideoVersion>('VideoVersion', VideoVersionSchema);

export { VideoVersionSchema };
