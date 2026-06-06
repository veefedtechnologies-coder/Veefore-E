import mongoose, { Document, Schema } from 'mongoose';

export interface IListeningTrend extends Document {
  workspaceId: mongoose.Types.ObjectId | string;
  topic: string;
  status: 'Early Emerging' | 'Growing' | 'Viral' | 'Saturated' | 'Declining';
  velocityScore: number; // 0-100
  opportunityScore: number; // 0-100
  volume: number; // total mentions in current window
  growthPercentage: number; // growth compared to previous window
  relatedKeywords: string[];
  samplePosts: string[]; // ObjectIds of sample ListeningPosts
  timeframe: '24h' | '7d' | '30d';
  lastCalculatedAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export const ListeningTrendSchema = new Schema<IListeningTrend>({
  workspaceId: { type: String, required: true, index: true },
  topic: { type: String, required: true },
  status: { type: String, required: true },
  velocityScore: { type: Number, default: 0 },
  opportunityScore: { type: Number, default: 0 },
  volume: { type: Number, default: 0 },
  growthPercentage: { type: Number, default: 0 },
  relatedKeywords: { type: [String], default: [] },
  samplePosts: { type: [String], default: [] },
  timeframe: { type: String, default: '7d' },
  lastCalculatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true,
  toJSON: { virtuals: true }
});

ListeningTrendSchema.index({ workspaceId: 1, velocityScore: -1 });
ListeningTrendSchema.index({ workspaceId: 1, topic: 1 });

export const ListeningTrendModel = mongoose.models.ListeningTrend as mongoose.Model<IListeningTrend> || mongoose.model<IListeningTrend>('ListeningTrend', ListeningTrendSchema, 'listening_trends');
