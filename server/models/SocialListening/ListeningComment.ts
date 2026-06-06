import mongoose, { Document, Schema } from 'mongoose';

export interface IListeningComment extends Document {
  postId: mongoose.Types.ObjectId | string;
  sourceId: mongoose.Types.ObjectId | string;
  workspaceId: mongoose.Types.ObjectId | string;
  platform: string;
  externalId: string;
  parentCommentId?: string; // For nested replies
  content: string;
  author: {
    username: string;
    profileUrl?: string;
  };
  metrics: {
    likes: number;
    replies: number;
  };
  publishedAt: Date;
  aiMetadata?: {
    sentiment?: 'positive' | 'negative' | 'neutral';
    painPoints?: string[];
    analyzedAt?: Date;
  };
  createdAt?: Date;
  updatedAt?: Date;
}

export const ListeningCommentSchema = new Schema<IListeningComment>({
  postId: { type: String, required: true, index: true },
  sourceId: { type: String, required: true },
  workspaceId: { type: String, required: true, index: true },
  platform: { type: String, required: true },
  externalId: { type: String, required: true },
  parentCommentId: { type: String },
  content: { type: String, required: true },
  author: {
    username: { type: String, required: true },
    profileUrl: { type: String }
  },
  metrics: {
    likes: { type: Number, default: 0 },
    replies: { type: Number, default: 0 }
  },
  publishedAt: { type: Date, required: true },
  aiMetadata: {
    sentiment: { type: String },
    painPoints: { type: [String], default: [] },
    analyzedAt: { type: Date }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true }
});

ListeningCommentSchema.index({ externalId: 1, platform: 1 }, { unique: true });

export const ListeningCommentModel = mongoose.models.ListeningComment as mongoose.Model<IListeningComment> || mongoose.model<IListeningComment>('ListeningComment', ListeningCommentSchema, 'listening_comments');
