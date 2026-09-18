import mongoose, { Schema, Document } from 'mongoose';

export interface IViralPattern extends Document {
  name: string;
  category: 'hook' | 'structure' | 'engagement' | 'storytelling';
  pattern: string;
  description: string;
  niches: string[];
  postTypes: ('post' | 'story' | 'reel')[];
  avgEngagementRate: number;
  usageCount: number;
  successRate: number;
  exampleCaptions: string[];
  trending: boolean;
  lastUsed?: Date;
  createdAt: Date;
}

const ViralPatternSchema = new Schema<IViralPattern>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      enum: ['hook', 'structure', 'engagement', 'storytelling'],
      required: true,
    },
    pattern: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    niches: {
      type: [String],
      default: [],
    },
    postTypes: {
      type: [String],
      enum: ['post', 'story', 'reel'],
      default: [],
    },
    avgEngagementRate: {
      type: Number,
      default: 0,
    },
    usageCount: {
      type: Number,
      default: 0,
    },
    successRate: {
      type: Number,
      default: 0,
    },
    exampleCaptions: {
      type: [String],
      default: [],
    },
    trending: {
      type: Boolean,
      default: false,
      index: true,
    },
    lastUsed: {
      type: Date,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false, // Using custom createdAt
    collection: 'viralpatterns',
  }
);

// Compound indexes for optimized queries
// Note: Cannot index two array fields together (MongoDB limitation)
// Instead, we'll index individual fields that are most commonly queried
ViralPatternSchema.index({ trending: 1, avgEngagementRate: -1 });
ViralPatternSchema.index({ category: 1, avgEngagementRate: -1 });
ViralPatternSchema.index({ niches: 1, avgEngagementRate: -1 }); // Index on niches for filtering

export const ViralPatternModel = mongoose.model<IViralPattern>(
  'ViralPattern',
  ViralPatternSchema
);
