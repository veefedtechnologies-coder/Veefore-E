import mongoose, { Schema, Document } from 'mongoose';

export interface IViralHook extends Document {
  hookText: string;
  niche: string;
  avgEngagementBoost: number;
  usageCount: number;
  createdAt: Date;
}

const ViralHookSchema = new Schema<IViralHook>(
  {
    hookText: {
      type: String,
      required: true,
      trim: true,
    },
    niche: {
      type: String,
      required: true,
      index: true,
    },
    avgEngagementBoost: {
      type: Number,
      default: 0,
    },
    usageCount: {
      type: Number,
      default: 0,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false, // Using custom createdAt
    collection: 'viralhooks',
  }
);

// Compound index for optimized queries
ViralHookSchema.index({ niche: 1, avgEngagementBoost: -1 });

export const ViralHookModel = mongoose.model<IViralHook>(
  'ViralHook',
  ViralHookSchema
);
