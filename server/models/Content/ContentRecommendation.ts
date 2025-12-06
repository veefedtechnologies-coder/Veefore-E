import mongoose, { Document, Schema, Model } from 'mongoose';

export interface IContentRecommendation extends Document {
  workspaceId: any;
  type: string;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  mediaUrl?: string;
  duration?: number;
  category: string;
  country: string;
  tags: string[];
  engagement: {
    expectedViews: number;
    expectedLikes: number;
    expectedShares: number;
  };
  sourceUrl?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ContentRecommendationSchema = new Schema<IContentRecommendation>({
  workspaceId: { type: Schema.Types.Mixed, required: true },
  type: { type: String, required: true },
  title: { type: String, required: true },
  description: String,
  thumbnailUrl: String,
  mediaUrl: String,
  duration: Number,
  category: { type: String, required: true },
  country: { type: String, required: true },
  tags: [String],
  engagement: {
    expectedViews: { type: Number, default: 0 },
    expectedLikes: { type: Number, default: 0 },
    expectedShares: { type: Number, default: 0 }
  },
  sourceUrl: String,
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

export const ContentRecommendationModel: Model<IContentRecommendation> = mongoose.model<IContentRecommendation>('ContentRecommendation', ContentRecommendationSchema);
export { ContentRecommendationSchema };
