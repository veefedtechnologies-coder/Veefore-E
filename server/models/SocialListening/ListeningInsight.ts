import mongoose, { Document, Schema } from 'mongoose';

export interface IListeningInsight extends Document {
  workspaceId: mongoose.Types.ObjectId | string;
  insightText: string;
  category: 'opportunity' | 'pain_point' | 'competitor' | 'trend' | 'general';
  confidence: number; // 0-100
  sourceTrends?: string[]; // ObjectIds of ListeningTrends
  sourcePosts?: string[]; // ObjectIds of ListeningPosts
  isRead?: boolean;
  isActionable?: boolean;
  actionText?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export const ListeningInsightSchema = new Schema<IListeningInsight>({
  workspaceId: { type: String, required: true, index: true },
  insightText: { type: String, required: true },
  category: { type: String, required: true },
  confidence: { type: Number, default: 0 },
  sourceTrends: { type: [String], default: [] },
  sourcePosts: { type: [String], default: [] },
  isRead: { type: Boolean, default: false },
  isActionable: { type: Boolean, default: false },
  actionText: { type: String }
}, {
  timestamps: true,
  toJSON: { virtuals: true }
});

ListeningInsightSchema.index({ workspaceId: 1, category: 1 });
ListeningInsightSchema.index({ workspaceId: 1, createdAt: -1 });

export const ListeningInsightModel = mongoose.models.ListeningInsight as mongoose.Model<IListeningInsight> || mongoose.model<IListeningInsight>('ListeningInsight', ListeningInsightSchema, 'listening_insights');
