import mongoose, { Document, Schema } from 'mongoose';

/**
 * Persists the state of an in-flight OpenAI Batch API job for Social Listening.
 *
 * WHY: The Batch API can take up to 24 hours. Keeping a 24-hour polling loop
 * in memory is fragile (server restart = lost job). Instead we store the batch
 * id + the submitted posts in MongoDB, then a lightweight recovery job checks
 * every 30 minutes for completed batches and finalizes the pipeline.
 *
 * This makes the batch truly fire-and-forget: submit, store, move on. The
 * recovery job does the rest whenever OpenAI is done — even across restarts.
 */
export interface IListeningBatchJob extends Document {
  workspaceId: string;
  niche: string;
  runId: string;
  batchId: string;              // OpenAI batch id
  status: 'pending' | 'completed' | 'failed' | 'superseded';
  // The posts that were submitted (content + platform), stored so the recovery
  // job can map results back and complete the trend-computation pipeline.
  analysisInputs: Array<{ content: string; platform: string }>;
  // Snapshot of posts with their metrics (needed for trend computation after
  // the batch result comes back — the live adapter data is gone by then).
  postSnapshots: any[];
  submittedAt: Date;
  completedAt?: Date;
  error?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const ListeningBatchJobSchema = new Schema<IListeningBatchJob>(
  {
    workspaceId: { type: String, required: true, index: true },
    niche: { type: String, required: true },
    runId: { type: String, required: true },
    batchId: { type: String, required: true, unique: true, index: true },
    status: { type: String, default: 'pending', index: true },
    analysisInputs: { type: [{ content: String, platform: String }], default: [] },
    postSnapshots: { type: [Schema.Types.Mixed], default: [] },
    submittedAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
    error: { type: String },
  },
  { timestamps: true }
);

// Auto-expire completed/failed jobs after 7 days so the collection stays lean.
ListeningBatchJobSchema.index(
  { completedAt: 1 },
  { expireAfterSeconds: 7 * 24 * 60 * 60, partialFilterExpression: { status: { $in: ['completed', 'failed', 'superseded'] } } }
);

export const ListeningBatchJobModel =
  (mongoose.models.ListeningBatchJob as mongoose.Model<IListeningBatchJob>) ||
  mongoose.model<IListeningBatchJob>(
    'ListeningBatchJob',
    ListeningBatchJobSchema,
    'listening_batch_jobs'
  );
