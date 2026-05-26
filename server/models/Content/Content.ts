import mongoose, { Document, Schema, Model } from 'mongoose';

export interface IContent extends Document {
  workspaceId: any;
  accountId?: string;
  type: string;
  title: string;
  description?: string;
  contentData: Record<string, any>;
  platform?: string;
  status: string;
  scheduledAt?: Date;
  publishedAt?: Date;
  creditsUsed: number;
  prompt?: string;
  metrics?: {
    likes?: number;
    comments?: number;
    shares?: number;
    saves?: number;
    engagement?: number;
    views?: number;
    reach?: number;
    impressions?: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const ContentSchema = new Schema<IContent>({
  workspaceId: { type: Schema.Types.Mixed, required: true },
  accountId: { type: String },
  type: { type: String, required: true },
  title: { type: String, required: true },
  description: String,
  contentData: { type: Schema.Types.Mixed, default: {} },
  platform: String,
  status: { type: String, default: 'draft' },
  scheduledAt: Date,
  publishedAt: Date,
  creditsUsed: { type: Number, default: 0 },
  prompt: String,
  metrics: {
    likes: { type: Number, default: 0 },
    comments: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
    saves: { type: Number, default: 0 },
    engagement: { type: Number, default: 0 },
    views: { type: Number, default: 0 },
    reach: { type: Number, default: 0 },
    impressions: { type: Number, default: 0 }
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

ContentSchema.index({ workspaceId: 1 }, { background: true });
ContentSchema.index({ status: 1 }, { background: true });
ContentSchema.index({ scheduledAt: 1 }, { background: true });
ContentSchema.index({ workspaceId: 1, status: 1 }, { background: true });
ContentSchema.index({ workspaceId: 1, accountId: 1 }, { background: true });
ContentSchema.index({ workspaceId: 1, status: 1, scheduledAt: 1 }, { background: true });
ContentSchema.index({ workspaceId: 1, createdAt: -1 }, { background: true });

export const ContentModel: Model<IContent> = mongoose.models.Content as Model<IContent> || mongoose.model<IContent>('Content', ContentSchema, 'contents');
export { ContentSchema };
