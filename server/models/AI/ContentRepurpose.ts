import mongoose, { Document, Schema, Model } from 'mongoose';

export interface IContentRepurpose extends Document {
  workspaceId: any;
  userId: any;
  originalContentId?: any;
  sourceLanguage: string;
  targetLanguage: string;
  sourceContent: string;
  repurposedContent: string;
  contentType: string;
  culturalAdaptations?: any;
  toneAdjustments?: any;
  platform: string;
  qualityScore?: number;
  isApproved: boolean;
  creditsUsed: number;
  createdAt: Date;
  updatedAt: Date;
}

export const ContentRepurposeSchema = new Schema<IContentRepurpose>({
  workspaceId: { type: Schema.Types.Mixed, required: true },
  userId: { type: Schema.Types.Mixed, required: true },
  originalContentId: { type: Schema.Types.Mixed },
  sourceLanguage: { type: String, required: true },
  targetLanguage: { type: String, required: true },
  sourceContent: { type: String, required: true },
  repurposedContent: { type: String, required: true },
  contentType: { type: String, required: true },
  culturalAdaptations: { type: Schema.Types.Mixed },
  toneAdjustments: { type: Schema.Types.Mixed },
  platform: { type: String, required: true },
  qualityScore: Number,
  isApproved: { type: Boolean, default: false },
  creditsUsed: { type: Number, default: 3 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

export const ContentRepurposeModel: Model<IContentRepurpose> = mongoose.model<IContentRepurpose>('ContentRepurpose', ContentRepurposeSchema);
