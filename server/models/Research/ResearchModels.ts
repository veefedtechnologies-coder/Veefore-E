import mongoose, { Document, Schema } from 'mongoose';

/**
 * Persistence for the VeeGPT Web Research & Trend Intelligence Engine.
 *
 * These collections give research durable history and let other Veefore
 * features (Social Listening, Competitor Analysis, Trend Calendar) reuse the
 * same data the engine produced. All are workspace-scoped and lean — heavy
 * page content is capped, and Redis remains the hot cache (these are the
 * durable record).
 */

export interface IResearchSource {
  title: string;
  url: string;
  domain?: string;
  snippet?: string;
  date?: string;
}

export interface ITrendTopic {
  topic: string;
  status: 'emerging' | 'rising' | 'trending' | 'saturated' | 'declining';
  note?: string;
}

// ─── SearchHistory: one row per research query run ──────────────────────────
export interface ISearchHistory extends Document {
  userId: string;
  workspaceId: string;
  query: string;
  mode: 'search' | 'trends' | 'competitors';
  resultCount: number;
  fromCache: boolean;
  createdAt: Date;
}

const SearchHistorySchema = new Schema<ISearchHistory>({
  userId: { type: String, required: true, index: true },
  workspaceId: { type: String, required: true, index: true },
  query: { type: String, required: true },
  mode: { type: String, default: 'search' },
  resultCount: { type: Number, default: 0 },
  fromCache: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});
SearchHistorySchema.index({ workspaceId: 1, createdAt: -1 });

export const SearchHistory =
  (mongoose.models.SearchHistory as mongoose.Model<ISearchHistory>) ||
  mongoose.model<ISearchHistory>('SearchHistory', SearchHistorySchema);

// ─── ResearchReport: the synthesized answer + sources (durable record) ──────
export interface IResearchReport extends Document {
  userId: string;
  workspaceId: string;
  query: string;
  mode: 'search' | 'trends' | 'competitors';
  answer: string;
  keyPoints: string[];
  trends?: ITrendTopic[];
  sources: IResearchSource[];
  createdAt: Date;
}

const ResearchReportSchema = new Schema<IResearchReport>({
  userId: { type: String, required: true, index: true },
  workspaceId: { type: String, required: true, index: true },
  query: { type: String, required: true },
  mode: { type: String, default: 'search' },
  answer: { type: String, default: '' },
  keyPoints: { type: [String], default: [] },
  trends: { type: Schema.Types.Mixed, default: undefined },
  sources: { type: Schema.Types.Mixed, default: [] },
  createdAt: { type: Date, default: Date.now },
});
ResearchReportSchema.index({ workspaceId: 1, createdAt: -1 });

export const ResearchReport =
  (mongoose.models.ResearchReport as mongoose.Model<IResearchReport>) ||
  mongoose.model<IResearchReport>('ResearchReport', ResearchReportSchema);

// ─── TrendTopic: latest trend snapshot per (workspace, niche) ───────────────
export interface ITrendTopicDoc extends Document {
  userId: string;
  workspaceId: string;
  niche: string;
  trends: ITrendTopic[];
  sources: IResearchSource[];
  updatedAt: Date;
  createdAt: Date;
}

const TrendTopicSchema = new Schema<ITrendTopicDoc>({
  userId: { type: String, required: true },
  workspaceId: { type: String, required: true },
  niche: { type: String, required: true },
  trends: { type: Schema.Types.Mixed, default: [] },
  sources: { type: Schema.Types.Mixed, default: [] },
  updatedAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});
TrendTopicSchema.index({ workspaceId: 1, niche: 1 }, { unique: true });

export const TrendTopic =
  (mongoose.models.TrendTopic as mongoose.Model<ITrendTopicDoc>) ||
  mongoose.model<ITrendTopicDoc>('TrendTopic', TrendTopicSchema);
