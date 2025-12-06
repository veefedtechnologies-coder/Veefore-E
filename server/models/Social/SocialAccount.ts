import mongoose, { Document, Schema } from 'mongoose';

export interface ISocialAccount extends Document {
  workspaceId: mongoose.Types.ObjectId | string;
  platform: string;
  username: string;
  accountId?: string;
  pageId?: string;
  accessToken?: string;
  refreshToken?: string;
  encryptedAccessToken?: any;
  encryptedRefreshToken?: any;
  expiresAt?: Date;
  tokenStatus?: string;
  isActive?: boolean;
  followersCount?: number;
  followingCount?: number;
  mediaCount?: number;
  biography?: string;
  website?: string;
  profilePictureUrl?: string;
  accountType?: string;
  isBusinessAccount?: boolean;
  isVerified?: boolean;
  avgLikes?: number;
  avgComments?: number;
  avgReach?: number;
  engagementRate?: number;
  totalLikes?: number;
  totalComments?: number;
  totalReach?: number;
  avgEngagement?: number;
  totalShares?: number;
  totalSaves?: number;
  lastSyncAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export const SocialAccountSchema = new Schema<ISocialAccount>({
  workspaceId: { type: Schema.Types.Mixed, required: true },
  platform: { type: String, required: true },
  username: { type: String, required: true },
  accountId: String,
  pageId: String,
  accessToken: String,
  refreshToken: String,
  encryptedAccessToken: { type: Schema.Types.Mixed, default: null },
  encryptedRefreshToken: { type: Schema.Types.Mixed, default: null },
  expiresAt: Date,
  tokenStatus: { type: String, default: 'valid' },
  isActive: { type: Boolean, default: true },
  followersCount: { type: Number, default: 0 },
  followingCount: { type: Number, default: 0 },
  mediaCount: { type: Number, default: 0 },
  biography: String,
  website: String,
  profilePictureUrl: String,
  accountType: { type: String, default: 'PERSONAL' },
  isBusinessAccount: { type: Boolean, default: false },
  isVerified: { type: Boolean, default: false },
  avgLikes: { type: Number, default: 0 },
  avgComments: { type: Number, default: 0 },
  avgReach: { type: Number, default: 0 },
  engagementRate: { type: Number, default: 0 },
  totalLikes: { type: Number, default: 0 },
  totalComments: { type: Number, default: 0 },
  totalReach: { type: Number, default: 0 },
  avgEngagement: { type: Number, default: 0 },
  totalShares: { type: Number, default: 0 },
  totalSaves: { type: Number, default: 0 },
  lastSyncAt: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

SocialAccountSchema.index({ accountId: 1 });
SocialAccountSchema.index({ workspaceId: 1, platform: 1 });

export const SocialAccountModel = mongoose.models.SocialAccount as mongoose.Model<ISocialAccount> || mongoose.model<ISocialAccount>('SocialAccount', SocialAccountSchema, 'socialaccounts');
