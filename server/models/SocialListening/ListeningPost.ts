import mongoose, { Document, Schema } from 'mongoose';

export interface IListeningPost extends Document {
  sourceId: mongoose.Types.ObjectId | string;
  workspaceId: mongoose.Types.ObjectId | string;
  platform: string;
  externalId: string; // ID from the origin platform
  url: string;
  content: string;
  title?: string;
  author: {
    username: string;
    profileUrl?: string;
    followerCount?: number;
    avatarUrl?: string;
  };
  metrics: {
    likes: number;
    comments: number;
    shares: number;
    views: number;
    engagementRate?: number;
  };
  publishedAt: Date;
  aiMetadata?: {
    sentiment?: 'positive' | 'negative' | 'neutral';
    sentimentScore?: number;
    emotions?: string[];
    hooks?: string[];
    painPoints?: string[];
    topics?: string[];
    hashtags?: string[];
    analyzedAt?: Date;
  };
  rawPayload?: Record<string, any>; // Store original raw data just in case
  createdAt?: Date;
  updatedAt?: Date;
}

export const ListeningPostSchema = new Schema<IListeningPost>({
  sourceId: { type: String, required: true, index: true },
  workspaceId: { type: String, required: true, index: true },
  platform: { type: String, required: true },
  externalId: { type: String, required: true },
  url: { type: String, required: true },
  content: { type: String, required: true },
  title: { type: String },
  author: {
    username: { type: String, required: true },
    profileUrl: { type: String },
    followerCount: { type: Number, default: 0 },
    avatarUrl: { type: String }
  },
  metrics: {
    likes: { type: Number, default: 0 },
    comments: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
    views: { type: Number, default: 0 },
    engagementRate: { type: Number, default: 0 }
  },
  publishedAt: { type: Date, required: true, index: true },
  aiMetadata: {
    sentiment: { type: String },
    sentimentScore: { type: Number },
    emotions: { type: [String], default: [] },
    hooks: { type: [String], default: [] },
    painPoints: { type: [String], default: [] },
    topics: { type: [String], default: [] },
    hashtags: { type: [String], default: [] },
    analyzedAt: { type: Date }
  },
  rawPayload: { type: Schema.Types.Mixed, select: false } // exclude by default
}, {
  timestamps: true,
  toJSON: { virtuals: true }
});

ListeningPostSchema.index({ externalId: 1, platform: 1 }, { unique: true });
ListeningPostSchema.index({ workspaceId: 1, publishedAt: -1 });

export const ListeningPostModel = mongoose.models.ListeningPost as mongoose.Model<IListeningPost> || mongoose.model<IListeningPost>('ListeningPost', ListeningPostSchema, 'listening_posts');
