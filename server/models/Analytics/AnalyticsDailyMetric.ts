import mongoose, { Document, Schema } from 'mongoose';

/**
 * AnalyticsDailyMetric — durable PER-DAY store of genuine, expensive-to-fetch
 * analytics that Meta retains historically but only exposes as window totals
 * (currently `follows_and_unfollows` gained/lost).
 *
 * Meta rejects `time_series` for this metric, so each day is fetched as its own
 * 1-day `total_value` request (real data, never interpolated — CODING_RULES
 * Rule 16). Because a completed day never changes, once stored it is IMMUTABLE
 * and never re-fetched. Storing per-day means ANY range or sub-range is answered
 * by summing the stored days — so viewing a range inside a previously-fetched
 * range is served entirely from MongoDB, no Meta call.
 *
 * One document per (accountId, metricGroup, date). `fetchedAt` records
 * provenance (when the value was pulled from the platform).
 *
 * SCOPING / NO-LEAK CONTRACT: rows are keyed by the platform `accountId` (the
 * Instagram user id), NOT by workspace, so that reconnecting the same account
 * (even in a different workspace) re-uses its already-fetched days. The
 * `workspaceId` field is INFORMATIONAL (last writer) and MUST NOT be used to
 * filter reads. Isolation is guaranteed upstream instead: callers only ever
 * read rows for account ids returned by `findActiveByWorkspace(workspaceId)`
 * for the authenticated, workspace-validated request — so a workspace can only
 * ever see the accounts actually connected to it. An Instagram account is
 * OAuth-owned, so whoever connects it is entitled to that account's own history.
 */
export interface IAnalyticsDailyMetric extends Document {
  workspaceId: string;
  accountId: string;
  platform: string;
  /** Logical group of metrics stored together (e.g. 'follows_and_unfollows'). */
  metricGroup: string;
  /** The UTC calendar day this value covers, `yyyy-mm-dd`. */
  date: string;
  /** Genuine per-day values (e.g. { gained, lost }). */
  values: Record<string, number>;
  /** True once the day is complete (before today, UTC) — never re-fetched. */
  immutable: boolean;
  /** When the value was last fetched from the platform. */
  fetchedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AnalyticsDailyMetricSchema: Schema = new Schema(
  {
    workspaceId: { type: String, required: true, index: true },
    accountId: { type: String, required: true, index: true },
    platform: { type: String, required: true, default: 'instagram' },
    metricGroup: { type: String, required: true },
    date: { type: String, required: true },
    values: { type: Schema.Types.Mixed, required: true, default: {} },
    immutable: { type: Boolean, required: true, default: false },
    fetchedAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// One stored value per day per account+group; also the range-query index.
AnalyticsDailyMetricSchema.index({ accountId: 1, metricGroup: 1, date: 1 }, { unique: true });

export default (mongoose.models.AnalyticsDailyMetric as mongoose.Model<IAnalyticsDailyMetric>) ||
  mongoose.model<IAnalyticsDailyMetric>('AnalyticsDailyMetric', AnalyticsDailyMetricSchema);
