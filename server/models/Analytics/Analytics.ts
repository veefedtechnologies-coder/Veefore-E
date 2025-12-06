import mongoose, { Document, Schema } from 'mongoose';

export interface IAnalytics extends Document {
  workspaceId: mongoose.Types.ObjectId | string;
  platform: string;
  date: Date;
  metrics: Record<string, any>;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  followers: number;
  engagement: number;
  reach: number;
  createdAt: Date;
}

export const AnalyticsSchema = new Schema<IAnalytics>({
  workspaceId: { type: Schema.Types.Mixed, required: true },
  platform: { type: String, required: true },
  date: { type: Date, required: true },
  metrics: { type: Schema.Types.Mixed, default: {} },
  views: { type: Number, default: 0 },
  likes: { type: Number, default: 0 },
  comments: { type: Number, default: 0 },
  shares: { type: Number, default: 0 },
  followers: { type: Number, default: 0 },
  engagement: { type: Number, default: 0 },
  reach: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

AnalyticsSchema.index({ workspaceId: 1, platform: 1, date: -1 });
AnalyticsSchema.index({ workspaceId: 1, date: -1 });

export const AnalyticsModel = mongoose.models.Analytics as mongoose.Model<IAnalytics> || mongoose.model<IAnalytics>('Analytics', AnalyticsSchema);
