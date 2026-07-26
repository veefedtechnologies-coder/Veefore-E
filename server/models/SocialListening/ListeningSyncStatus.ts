import mongoose, { Document, Schema } from 'mongoose';

/**
 * Tracks the live-sync progress for a workspace's Social Listening data.
 *
 * The "Sync Live Data" run is long (fetch across 4+ networks → AI analysis →
 * trend computation), so we persist its state here instead of relying on a
 * transient in-flight HTTP request. This is what lets the UI show an accurate
 * "Syncing… (phase, % done, ETA)" indicator that SURVIVES a page refresh and
 * only clears when the data is genuinely ready — fixing the bug where the
 * spinner vanished after a refresh while data was still being built.
 */
export type SyncPhase =
  | 'idle'
  | 'queued'
  | 'fetching'      // pulling posts + comments from the source networks
  | 'analyzing'     // AI sentiment/topic/hook extraction (batched)
  | 'computing'     // trend engine + aggregation
  | 'completed'
  | 'failed';

export interface IListeningSyncStatus extends Document {
  workspaceId: string;
  niche: string;
  phase: SyncPhase;
  progress: number;          // 0..100
  message: string;           // human-readable current step
  // Live counters so the UI can show real numbers as they accrue.
  postsFetched: number;
  commentsFetched: number;
  postsAnalyzed: number;
  postsToAnalyze: number;
  trendsComputed: number;
  // Timing for the ETA display.
  startedAt: Date;
  estimatedCompletionAt?: Date;
  finishedAt?: Date;
  // True async batch (OpenAI Batch API) bookkeeping when used.
  batchMode: boolean;
  batchId?: string;
  // Which kind of run owns the status doc, and a generation token used to
  // supersede a running background sync when the user triggers an interactive
  // one (the background loop sees a newer runId and cancels its batch).
  mode: 'interactive' | 'background';
  runId: string;
  error?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const ListeningSyncStatusSchema = new Schema<IListeningSyncStatus>(
  {
    workspaceId: { type: String, required: true, unique: true, index: true },
    niche: { type: String, default: '' },
    phase: { type: String, default: 'idle' },
    progress: { type: Number, default: 0 },
    message: { type: String, default: '' },
    postsFetched: { type: Number, default: 0 },
    commentsFetched: { type: Number, default: 0 },
    postsAnalyzed: { type: Number, default: 0 },
    postsToAnalyze: { type: Number, default: 0 },
    trendsComputed: { type: Number, default: 0 },
    startedAt: { type: Date, default: Date.now },
    estimatedCompletionAt: { type: Date },
    finishedAt: { type: Date },
    batchMode: { type: Boolean, default: false },
    batchId: { type: String },
    mode: { type: String, default: 'interactive' },
    runId: { type: String, default: '' },
    error: { type: String },
  },
  { timestamps: true, toJSON: { virtuals: true } }
);

export const ListeningSyncStatusModel =
  (mongoose.models.ListeningSyncStatus as mongoose.Model<IListeningSyncStatus>) ||
  mongoose.model<IListeningSyncStatus>(
    'ListeningSyncStatus',
    ListeningSyncStatusSchema,
    'listening_sync_status'
  );
