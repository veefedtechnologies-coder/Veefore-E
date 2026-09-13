/**
 * VideoEditJob — an asynchronous unit of work executed on a BullMQ worker.
 *
 * Tracks the job state machine, attempt count, timeout, stage-derived progress,
 * input/output artifact references, and the credit idempotency link. The
 * idempotency key mirrors the metering idempotency key so retries are at-most-once
 * (Req 18.3, 18.7).
 */

import mongoose, { Document, Schema, Model } from 'mongoose';

// The job state machine is the canonical source of `JobState` and the ordered
// state set. Re-exporting from the pure logic core keeps the schema enum below
// and the state machine from ever drifting apart (Req 18.2).
import { JOB_STATES as JOB_STATES_TUPLE, type JobState } from '../../features/video-editor/services/job-state.logic';

export type { JobState };

/** Ordered list of the twelve job states (mutable array for the schema enum). */
export const JOB_STATES: JobState[] = [...JOB_STATES_TUPLE];

export interface IVideoEditJob extends Document {
  jobId: string;              // unique, indexed
  projectId: string;          // indexed
  workspaceId: string;        // indexed
  userId: string;             // indexed
  idempotencyKey: string;     // unique — mirrors metering idempotency (Req 18.3, 18.7)
  state: JobState;            // indexed
  attempt: number;            // from 1
  timeoutSec: number;         // ≤3600
  progress: number;           // 0..100, stage-derived
  completedStages: string[];
  inputArtifactIds: string[];
  outputArtifactIds: string[];
  errorCode?: string;
  creditIdempotencyKey?: string; // link to AICreditTransaction
  createdAt: Date;
  updatedAt: Date;
}

const VideoEditJobSchema = new Schema<IVideoEditJob>(
  {
    jobId: { type: String, required: true, unique: true, index: true },
    projectId: { type: String, required: true, index: true },
    workspaceId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    idempotencyKey: { type: String, required: true, unique: true, index: true },
    state: {
      type: String,
      enum: JOB_STATES,
      default: 'QUEUED',
      index: true,
    },
    attempt: { type: Number, default: 1 },
    timeoutSec: { type: Number, default: 3600 },
    progress: { type: Number, default: 0 },
    completedStages: { type: [String], default: [] },
    inputArtifactIds: { type: [String], default: [] },
    outputArtifactIds: { type: [String], default: [] },
    errorCode: { type: String },
    creditIdempotencyKey: { type: String },
  },
  { timestamps: true }
);

VideoEditJobSchema.index({ projectId: 1, state: 1, createdAt: -1 });

export const VideoEditJobModel: Model<IVideoEditJob> =
  (mongoose.models.VideoEditJob as Model<IVideoEditJob>) ||
  mongoose.model<IVideoEditJob>('VideoEditJob', VideoEditJobSchema);

export { VideoEditJobSchema };
