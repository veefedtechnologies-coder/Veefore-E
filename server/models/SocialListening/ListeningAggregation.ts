import mongoose, { Schema, Document } from 'mongoose';

export interface IListeningAggregation extends Document {
  workspaceId: string;
  date: Date;
  metrics: {
    totalPosts: number;
    totalComments: number;
    totalEngagement: number;
  };
  sentiment: {
    positive: number;
    neutral: number;
    negative: number;
    averageScore: number;
  };
  topTopics: Array<{
    topic: string;
    count: number;
    sentimentScore: number;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const ListeningAggregationSchema = new Schema<IListeningAggregation>(
  {
    workspaceId: { type: String, required: true, index: true },
    date: { type: Date, required: true },
    metrics: {
      totalPosts: { type: Number, default: 0 },
      totalComments: { type: Number, default: 0 },
      totalEngagement: { type: Number, default: 0 },
    },
    sentiment: {
      positive: { type: Number, default: 0 },
      neutral: { type: Number, default: 0 },
      negative: { type: Number, default: 0 },
      averageScore: { type: Number, default: 0 },
    },
    topTopics: [
      {
        topic: { type: String },
        count: { type: Number },
        sentimentScore: { type: Number },
      }
    ]
  },
  { timestamps: true }
);

// Compound index for fast time-series queries
ListeningAggregationSchema.index({ workspaceId: 1, date: -1 });

export const ListeningAggregationModel = mongoose.models.ListeningAggregation || mongoose.model<IListeningAggregation>('ListeningAggregation', ListeningAggregationSchema);
