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
  audienceCity?: Map<string, number>;
  audienceCountry?: Map<string, number>;
  audienceGenderAge?: Map<string, number>;
  audienceActiveTime?: Map<string, number>;
  aiBestActiveTime?: {
    best_hour: number;
    best_hour_label: string;
    best_hours: number[];
    best_window_label: string;
    best_window?: {
      start: number;
      end: number;
    };
    confidence: number;
    confidence_level?: string;
    status?: string;
    posts_used: number; // Keep for legacy
    usable_posts?: number;
    scanned_posts?: number;
    z_score?: number;
    separation_ratio?: number;
    entropy?: number;
    dominant_weekday?: string;
    heatmap_data?: number[][];
    daily_best_hours?: Array<{
      day: number;
      day_name: string;
      best_hour: number;
      score: number;
      confidence: number;
      confidence_level: string;
      status: string;
      is_peak: boolean;
    }>;
    method: string;
    lastComputedAt: Date;
  };
  lastSyncAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export const SocialAccountSchema = new Schema<ISocialAccount>({
  workspaceId: { type: String, required: true },
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
  audienceCity: { type: Map, of: Number, default: {} },
  audienceCountry: { type: Map, of: Number, default: {} },
  audienceGenderAge: { type: Map, of: Number, default: {} },
  audienceActiveTime: { type: Map, of: Number, default: {} },
  aiBestActiveTime: {
    best_hour: { type: Number, default: null },
    best_hour_label: { type: String, default: null },
    best_hours: { type: [Number], default: [] },
    best_window_label: { type: String, default: null },
    best_window: {
      start: Number,
      end: Number
    },
    confidence: { type: Number, default: 0 },
    confidence_level: { type: String, default: 'Learning' },
    status: { type: String, default: 'Learning' },
    posts_used: { type: Number, default: 0 },
    usable_posts: { type: Number, default: 0 },
    z_score: { type: Number, default: 0 },
    separation_ratio: { type: Number, default: 0 },
    entropy: { type: Number, default: 0 },
    dominant_weekday: { type: String, default: null },
    heatmap_data: { type: Schema.Types.Mixed, default: [] },
    daily_best_hours: { type: Schema.Types.Mixed, default: [] },
    today_best_hour: { type: Number, default: null },
    next_peak_at: { type: Date, default: null },
    billboard_day: { type: String, default: 'Today' },
    is_billboard_today: { type: Boolean, default: true },
    method: { type: String, default: 'AI Post Performance Model (V4 Adaptive)' },
    lastComputedAt: { type: Date, default: null }
  },
  lastSyncAt: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (doc, ret) => {
      if (ret._id) {
        ret.id = ret._id.toString();
      }
      return ret;
    }
  },
  toObject: { virtuals: true },
  bufferCommands: false // P1 FIX: Fail fast on connection issues instead of buffering/hanging
});

SocialAccountSchema.index({ workspaceId: 1 }, { background: true });
SocialAccountSchema.index({ platform: 1 }, { background: true });
SocialAccountSchema.index({ accountId: 1 }, { background: true });
SocialAccountSchema.index({ workspaceId: 1, platform: 1 }, { background: true });
SocialAccountSchema.index({ isActive: 1 }, { background: true });
SocialAccountSchema.index({ workspaceId: 1, isActive: 1 }, { background: true });
SocialAccountSchema.index({ isActive: 1, tokenStatus: 1 }, { background: true });
SocialAccountSchema.index({ isActive: 1, lastSyncAt: 1 }, { background: true });
SocialAccountSchema.index({ accountId: 1, platform: 1 }, { background: true });
// Webhook lookup optimization indexes
SocialAccountSchema.index({ pageId: 1, platform: 1 }, { background: true });
SocialAccountSchema.index({ platform: 1, accountId: 1, isActive: 1 }, { background: true });

export const SocialAccountModel = mongoose.models.SocialAccount as mongoose.Model<ISocialAccount> || mongoose.model<ISocialAccount>('SocialAccount', SocialAccountSchema, 'socialaccounts');
