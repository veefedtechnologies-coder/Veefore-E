import mongoose, { Document, Schema, Model } from 'mongoose';

export interface IFeatureUsage extends Document {
  userId: any;
  featureId: string;
  usageCount: number;
  lastUsed: Date;
  metadata: any;
  createdAt: Date;
  updatedAt: Date;
}

export const FeatureUsageSchema = new Schema<IFeatureUsage>({
  userId: { type: Schema.Types.Mixed, required: true },
  featureId: { type: String, required: true },
  usageCount: { type: Number, default: 0 },
  lastUsed: { type: Date, default: Date.now },
  metadata: { type: Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

export const FeatureUsageModel: Model<IFeatureUsage> = mongoose.models.FeatureUsage as Model<IFeatureUsage> || mongoose.model<IFeatureUsage>('FeatureUsage', FeatureUsageSchema);
