import mongoose, { Document, Schema, Model } from 'mongoose';

export interface ICreativeBrief extends Document {
  workspaceId: any;
  userId: any;
  title: string;
  targetAudience: string;
  platforms: any;
  campaignGoals: any;
  tone: string;
  style: string;
  industry: string;
  deadline?: Date;
  budget?: number;
  briefContent: string;
  keyMessages?: any;
  contentFormats?: any;
  hashtags?: any;
  references?: any;
  status: string;
  creditsUsed: number;
  createdAt: Date;
  updatedAt: Date;
}

export const CreativeBriefSchema = new Schema<ICreativeBrief>({
  workspaceId: { type: Schema.Types.Mixed, required: true },
  userId: { type: Schema.Types.Mixed, required: true },
  title: { type: String, required: true },
  targetAudience: { type: String, required: true },
  platforms: { type: Schema.Types.Mixed, required: true },
  campaignGoals: { type: Schema.Types.Mixed, required: true },
  tone: { type: String, required: true },
  style: { type: String, required: true },
  industry: { type: String, required: true },
  deadline: Date,
  budget: Number,
  briefContent: { type: String, required: true },
  keyMessages: { type: Schema.Types.Mixed },
  contentFormats: { type: Schema.Types.Mixed },
  hashtags: { type: Schema.Types.Mixed },
  references: { type: Schema.Types.Mixed },
  status: { type: String, default: 'draft' },
  creditsUsed: { type: Number, default: 5 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

export const CreativeBriefModel: Model<ICreativeBrief> = mongoose.models.CreativeBrief as Model<ICreativeBrief> || mongoose.model<ICreativeBrief>('CreativeBrief', CreativeBriefSchema);
