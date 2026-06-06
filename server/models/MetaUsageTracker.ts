import mongoose, { Document, Schema, Model } from 'mongoose';

export interface IMetaUsageTracker extends Document {
  appUsagePercent: number;
  businessUsagePercent: number;
  pageUsagePercent: number;
  lastHeaders: Record<string, any>;
  endpoint?: string;
  createdAt: Date;
}

const MetaUsageTrackerSchema = new Schema<IMetaUsageTracker>({
  appUsagePercent: { type: Number, default: 0 },
  businessUsagePercent: { type: Number, default: 0 },
  pageUsagePercent: { type: Number, default: 0 },
  lastHeaders: { type: Schema.Types.Mixed },
  endpoint: { type: String },
  createdAt: { type: Date, default: Date.now }
});

MetaUsageTrackerSchema.index({ createdAt: -1 });

export const MetaUsageTracker: Model<IMetaUsageTracker> = mongoose.models.MetaUsageTracker as Model<IMetaUsageTracker> || mongoose.model<IMetaUsageTracker>('MetaUsageTracker', MetaUsageTrackerSchema, 'metaUsageTrackers');
export default MetaUsageTracker;
