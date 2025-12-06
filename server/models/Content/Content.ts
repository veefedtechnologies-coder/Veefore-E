import mongoose, { Document, Schema, Model } from 'mongoose';

export interface IContent extends Document {
  workspaceId: any;
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
  createdAt: Date;
  updatedAt: Date;
}

const ContentSchema = new Schema<IContent>({
  workspaceId: { type: Schema.Types.Mixed, required: true },
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
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

ContentSchema.index({ workspaceId: 1, status: 1, scheduledAt: 1 });
ContentSchema.index({ workspaceId: 1, createdAt: -1 });

export const ContentModel: Model<IContent> = mongoose.model<IContent>('Content', ContentSchema, 'contents');
export { ContentSchema };
