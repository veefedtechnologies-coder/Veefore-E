import mongoose, { Document, Schema, Model } from 'mongoose';

export interface IContent extends Document {
  workspaceId: any;
  accountId?: string;
  instagramPostId?: string;
  type: string;
  title: string;
  description?: string;
  contentData: Record<string, any>;
  platform?: string;
  status: string;
  scheduledAt?: Date;
  publishedAt?: Date;
  processingStartedAt?: Date;
  failedAt?: Date;
  retryAt?: Date;
  publishAttempts?: number;
  metaCreationId?: string;
  metaPublishedId?: string;
  lastError?: string;
  creditsUsed: number;
  prompt?: string;
  isImported?: boolean;
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
  lastInsightsFetchedAt?: Date;
  disconnectedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ContentSchema = new Schema<IContent>({
  workspaceId: { type: Schema.Types.Mixed, required: true },
  accountId: { type: String },
  instagramPostId: { type: String },
  type: { type: String, required: true },
  title: { type: String, required: true },
  description: String,
  contentData: { type: Schema.Types.Mixed, default: {} },
  platform: String,
  status: { 
    type: String, 
    default: 'draft',
    enum: ['draft', 'scheduled', 'queued', 'publishing', 'processing', 'published', 'partially_published', 'retrying', 'failed', 'cancelled', 'expired', 'generating'] // 'generating' is a common state too
  },
  scheduledAt: Date,
  publishedAt: Date,
  processingStartedAt: Date,
  failedAt: Date,
  retryAt: Date,
  publishAttempts: { type: Number, default: 0 },
  metaCreationId: String,
  metaPublishedId: String,
  lastError: String,
  creditsUsed: { type: Number, default: 0 },
  prompt: String,
  isImported: { type: Boolean, default: false },
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
  lastInsightsFetchedAt: { type: Date, default: null },
  disconnectedAt: { type: Date, default: null },
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
ContentSchema.index({ workspaceId: 1, accountId: 1, publishedAt: -1 }, { background: true });
ContentSchema.index({ 'contentData.id': 1 }, { background: true });

export const ContentModel: Model<IContent> = mongoose.models.Content as Model<IContent> || mongoose.model<IContent>('Content', ContentSchema, 'contents');
export { ContentSchema };
