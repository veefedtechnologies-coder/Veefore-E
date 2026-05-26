import mongoose, { Document, Schema } from 'mongoose';

export interface IAnalytics extends Document {
  workspaceId: mongoose.Types.ObjectId | string;
  accountId?: string;
  platform: string;
  date: Date;
  metrics: Record<string, any>;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  followers: number;
  posts: number;
  reach: number;
  reachDay: number;
  reachWeek: number;
  reachDays28: number;
  engagement: number;

  // Audience Demographics
  audienceCity?: Map<string, number>;
  audienceCountry?: Map<string, number>;
  audienceGenderAge?: Map<string, number>;
  audienceActiveTime?: Map<string, number>;

  sentiment?: {
    positive: number;
    neutral: number;
    negative: number;
  };
  createdAt: Date;
}

export const AnalyticsSchema = new Schema<IAnalytics>({
  workspaceId: { type: String, required: true, index: true },
  accountId: { type: String, required: false, index: true },
  platform: { type: String, required: true, index: true },
  date: { type: Date, required: true, index: true },
  metrics: { type: Map, of: Schema.Types.Mixed, default: {} },

  // Standard metrics
  views: { type: Number, default: 0 },
  likes: { type: Number, default: 0 },
  comments: { type: Number, default: 0 },
  shares: { type: Number, default: 0 },
  followers: { type: Number, default: 0 },
  posts: { type: Number, default: 0 },
  engagement: { type: Number, default: 0 },
  reach: { type: Number, default: 0 },
  reachDay: { type: Number, default: 0 },
  reachWeek: { type: Number, default: 0 },
  reachDays28: { type: Number, default: 0 },

  // Audience Demographics
  audienceCity: { type: Map, of: Number, default: {} },
  audienceCountry: { type: Map, of: Number, default: {} },
  audienceGenderAge: { type: Map, of: Number, default: {} },
  audienceActiveTime: { type: Map, of: Number, default: {} },

  sentiment: {
    positive: { type: Number, default: 0 },
    neutral: { type: Number, default: 0 },
    negative: { type: Number, default: 0 }
  },
  createdAt: { type: Date, default: Date.now }
});

AnalyticsSchema.index({ workspaceId: 1 }, { background: true });
AnalyticsSchema.index({ platform: 1 }, { background: true });
AnalyticsSchema.index({ accountId: 1 }, { background: true });
AnalyticsSchema.index({ date: -1 }, { background: true });
AnalyticsSchema.index({ workspaceId: 1, platform: 1, date: -1 }, { background: true });
AnalyticsSchema.index({ workspaceId: 1, accountId: 1, date: -1 }, { background: true });
AnalyticsSchema.index({ workspaceId: 1, date: -1 }, { background: true });

export const AnalyticsModel = mongoose.models.Analytics as mongoose.Model<IAnalytics> || mongoose.model<IAnalytics>('Analytics', AnalyticsSchema);
