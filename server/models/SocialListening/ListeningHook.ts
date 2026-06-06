import mongoose, { Schema, Document } from 'mongoose';

export interface IListeningHook extends Document {
  workspaceId: string;
  sourcePostId: string; // ID of the original ListeningPost
  platform: string;
  type: 'hook' | 'pain_point';
  content: string;
  score: number; // Opportunity score or virality potential (0-100)
  metrics: {
    engagementAtExtraction: number;
  };
  topics: string[];
  createdAt: Date;
  updatedAt: Date;
}

const ListeningHookSchema = new Schema<IListeningHook>(
  {
    workspaceId: { type: String, required: true, index: true },
    sourcePostId: { type: String, required: true },
    platform: { type: String, required: true },
    type: { type: String, enum: ['hook', 'pain_point'], required: true, index: true },
    content: { type: String, required: true },
    score: { type: Number, default: 0 },
    metrics: {
      engagementAtExtraction: { type: Number, default: 0 },
    },
    topics: [{ type: String }],
  },
  { timestamps: true }
);

// Indexes for fast retrieval
ListeningHookSchema.index({ workspaceId: 1, type: 1, score: -1 });

export const ListeningHookModel = mongoose.models.ListeningHook || mongoose.model<IListeningHook>('ListeningHook', ListeningHookSchema);
