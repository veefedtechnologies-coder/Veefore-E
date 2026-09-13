/**
 * VideoEditOperation — a single planned operation within an editing plan.
 *
 * Records the operation type, kind, target range, preservation constraints, its
 * executable/unavailable/error status, and the routing decision (provider/model/
 * reason) applied by the Model_Router (Req 6.6).
 */

import mongoose, { Document, Schema, Model } from 'mongoose';

export type VideoEditOperationType =
  | 'deterministic'
  | 'generative'
  | 'analysis'
  | 'render';

export type VideoEditOperationStatus =
  | 'executable'
  | 'unavailable'
  | 'error'
  | 'completed'
  | 'failed';

export interface IVideoEditOperationRouting {
  provider: string;
  model: string;
  reason: string;
}

export interface IVideoEditOperation extends Document {
  operationId: string;        // unique, indexed
  projectId: string;          // indexed
  jobId?: string;             // indexed
  sequenceIndex: number;
  type: VideoEditOperationType;
  kind: string;
  startMs: number;
  endMs: number;
  preservationConstraints: string[];
  status: VideoEditOperationStatus; // indexed
  limitation?: string;
  routing?: IVideoEditOperationRouting; // Req 6.6
  createdAt: Date;
  updatedAt: Date;
}

const VideoEditOperationSchema = new Schema<IVideoEditOperation>(
  {
    operationId: { type: String, required: true, unique: true, index: true },
    projectId: { type: String, required: true, index: true },
    jobId: { type: String, index: true },
    sequenceIndex: { type: Number, required: true },
    type: {
      type: String,
      enum: ['deterministic', 'generative', 'analysis', 'render'],
      required: true,
    },
    kind: { type: String, required: true },
    startMs: { type: Number, required: true },
    endMs: { type: Number, required: true },
    preservationConstraints: { type: [String], default: [] },
    status: {
      type: String,
      enum: ['executable', 'unavailable', 'error', 'completed', 'failed'],
      required: true,
      index: true,
    },
    limitation: { type: String },
    routing: {
      type: new Schema<IVideoEditOperationRouting>(
        {
          provider: { type: String, required: true },
          model: { type: String, required: true },
          reason: { type: String, required: true },
        },
        { _id: false }
      ),
      required: false,
    },
  },
  { timestamps: true }
);

VideoEditOperationSchema.index({ projectId: 1, sequenceIndex: 1 });
VideoEditOperationSchema.index({ jobId: 1, createdAt: -1 });

export const VideoEditOperationModel: Model<IVideoEditOperation> =
  (mongoose.models.VideoEditOperation as Model<IVideoEditOperation>) ||
  mongoose.model<IVideoEditOperation>('VideoEditOperation', VideoEditOperationSchema);

export { VideoEditOperationSchema };
