/**
 * VideoArtifact — an immutable, single-category output with full provenance.
 *
 * Every artifact belongs to exactly one of eight categories (Req 20.1), its bytes
 * live immutably in StorageService (Req 20.4), and its provenance is required at
 * creation (jobId, inputVersionId, provider, model, prompt, cost) (Req 20.2, 20.3).
 * For deterministic artifacts provider/model record the engine id (e.g. `ffmpeg`).
 */

import mongoose, { Document, Schema, Model } from 'mongoose';

export type ArtifactCategory =
  | 'original'
  | 'proxy'
  | 'audio'
  | 'thumbnails'
  | 'analysis'
  | 'generated'
  | 'renders'
  | 'exports';

export const ARTIFACT_CATEGORIES: ArtifactCategory[] = [
  'original',
  'proxy',
  'audio',
  'thumbnails',
  'analysis',
  'generated',
  'renders',
  'exports',
];

export interface IVideoArtifactProvenance {
  jobId: string;
  inputVersionId: string;
  provider: string;
  model: string;
  prompt: string;
  costCredits: number;
}

export interface IVideoArtifact extends Document {
  artifactId: string;         // unique, indexed
  projectId: string;          // indexed
  workspaceId: string;        // indexed
  userId: string;             // indexed
  category: ArtifactCategory; // exactly one of eight (Req 20.1)
  storageKey: string;         // immutable bytes (Req 20.4)
  mimeType: string;
  sizeBytes?: number;
  provenance: IVideoArtifactProvenance; // all required (Req 20.2, 20.3)
  createdAt: Date;
  updatedAt: Date;
}

const VideoArtifactProvenanceSchema = new Schema<IVideoArtifactProvenance>(
  {
    jobId: { type: String, required: true },
    inputVersionId: { type: String, required: true },
    provider: { type: String, required: true },
    model: { type: String, required: true },
    prompt: { type: String, required: true },
    costCredits: { type: Number, required: true },
  },
  { _id: false }
);

const VideoArtifactSchema = new Schema<IVideoArtifact>(
  {
    artifactId: { type: String, required: true, unique: true, index: true },
    projectId: { type: String, required: true, index: true },
    workspaceId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    category: {
      type: String,
      enum: ARTIFACT_CATEGORIES,
      required: true,
      index: true,
    },
    storageKey: { type: String, required: true },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number },
    provenance: { type: VideoArtifactProvenanceSchema, required: true },
  },
  { timestamps: true }
);

VideoArtifactSchema.index({ projectId: 1, category: 1, createdAt: -1 });

export const VideoArtifactModel: Model<IVideoArtifact> =
  (mongoose.models.VideoArtifact as Model<IVideoArtifact>) ||
  mongoose.model<IVideoArtifact>('VideoArtifact', VideoArtifactSchema);

export { VideoArtifactSchema };
