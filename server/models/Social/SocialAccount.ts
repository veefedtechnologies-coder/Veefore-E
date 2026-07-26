import mongoose, { Document, Schema } from 'mongoose';

// ---------------------------------------------------------------------------
// Platform-related TypeScript types (exported for use across the codebase)
// ---------------------------------------------------------------------------

/** Connection lifecycle states for a SocialAccount. */
export type ConnectionStatus = 'ACTIVE' | 'DISCONNECTED' | 'REQUIRES_RECONNECT' | 'SYNCING';

/** Facebook-specific metadata stored in `platformMetadata`. */
export interface FacebookPlatformMetadata {
  pageCategory?: string;
  pageFanCount?: number;
  /** Meta Business Suite ID — used to detect MetaBusinessRelationship with Instagram accounts. */
  metaBusinessId?: string;
  /** Instagram Business Account ID linked to this Facebook Page under the same Meta Business. */
  linkedInstagramAccountId?: string;
}

/** Instagram-specific metadata stored in `platformMetadata`. */
export interface InstagramPlatformMetadata {
  accountType?: 'BUSINESS' | 'CREATOR' | 'PERSONAL';
  /** Meta Business Suite ID — used to detect MetaBusinessRelationship with Facebook Pages. */
  metaBusinessId?: string;
}

// ---------------------------------------------------------------------------
// Document interface
// ---------------------------------------------------------------------------

export interface ISocialAccount extends Document {
  workspaceId: mongoose.Types.ObjectId | string;
  /**
   * Platform discriminator. Defaults to `'instagram'` for backward compatibility
   * with existing records created before multi-platform support was added.
   */
  platform: 'instagram' | 'facebook' | 'linkedin' | 'youtube' | 'tiktok' | 'pinterest' | 'x' | 'threads';
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
  /**
   * Meta's true account-level reach over the trailing 28 days (deduplicated
   * unique accounts), from `/{account}/insights?metric=reach&period=days_28`.
   * Distinct from `totalReach`, which is the SUM of per-post reaches and double-
   * counts users who saw multiple posts. Surfaced as the account card's
   * "Account Reach" so it shows genuine account-level reach, not a post roll-up.
   */
  accountReach?: number;
  totalViews?: number;
  avgEngagement?: number;
  totalShares?: number;
  totalSaves?: number;
  audienceCity?: Map<string, number>;
  audienceCountry?: Map<string, number>;
  audienceGenderAge?: Map<string, number>;
  audienceActiveTime?: Map<string, number>;
  /**
   * 7×24 weekly heatmap: keys are "DOW_HOUR" (0=Sun … 6=Sat, hour 0–23).
   * E.g. "1_9" = Monday 9 AM. Values are averaged follower counts over 30 days.
   * Drives the Hootsuite-style day-of-week × hour grid on the Best Time page.
   */
  audienceActiveTimeWeekly?: Map<string, number>;
  /** When demographics (country/city/gender-age) were last fetched from Meta. */
  demographicsLastFetched?: Date;
  lastSyncAt?: Date;
  // -------------------------------------------------------------------------
  // Multi-platform extension fields (Requirements 3.1–3.5)
  // -------------------------------------------------------------------------
  /** Display name of the Facebook Page (or equivalent page name for future platforms). */
  pageName?: string;
  /** Facebook Page category (e.g. "Media/News Company"). Stored at top level for quick querying. */
  pageCategory?: string;
  /** When the platform access token expires. */
  tokenExpiresAt?: Date;
  /** OAuth permission scopes granted by the user at connection time. */
  permissions?: string[];
  /** When this account was first connected to the workspace. */
  connectedAt?: Date;
  /**
   * Current connection health state.
   * - ACTIVE: token valid, polling enabled
   * - DISCONNECTED: user-initiated disconnect
   * - REQUIRES_RECONNECT: token expired or revoked — user must re-authorise
   * - SYNCING: actively syncing data
   */
  connectionStatus?: ConnectionStatus;
  /**
   * Platform-specific metadata sub-document. Typed via `FacebookPlatformMetadata`
   * or `InstagramPlatformMetadata` depending on `platform`.
   * No platform-specific field should appear at the top level of this schema.
   */
  platformMetadata?: FacebookPlatformMetadata | InstagramPlatformMetadata | Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

export const SocialAccountSchema = new Schema<ISocialAccount>({
  workspaceId: { type: String, required: true },
  platform: {
    type: String,
    enum: ['instagram', 'facebook', 'linkedin', 'youtube', 'tiktok', 'pinterest', 'x', 'threads'],
    required: true,
    default: 'instagram', // backward compat — existing Instagram records get this value on first read
  },
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
  accountReach: { type: Number, default: 0 },
  totalViews: { type: Number, default: 0 },
  avgEngagement: { type: Number, default: 0 },
  totalShares: { type: Number, default: 0 },
  totalSaves: { type: Number, default: 0 },
  audienceCity: { type: Map, of: Number, default: {} },
  audienceCountry: { type: Map, of: Number, default: {} },
  audienceGenderAge: { type: Map, of: Number, default: {} },
  audienceActiveTime: { type: Map, of: Number, default: {} },
  audienceActiveTimeWeekly: { type: Map, of: Number, default: {} },
  demographicsLastFetched: { type: Date, default: null },
  lastSyncAt: Date,
  // ---------------------------------------------------------------------------
  // Multi-platform extension fields (Requirements 3.1–3.5)
  // ---------------------------------------------------------------------------
  pageName: { type: String },
  pageCategory: { type: String },
  tokenExpiresAt: { type: Date },
  permissions: [{ type: String }],
  connectedAt: { type: Date, default: Date.now },
  connectionStatus: {
    type: String,
    enum: ['ACTIVE', 'DISCONNECTED', 'REQUIRES_RECONNECT', 'SYNCING'],
    default: 'ACTIVE',
  },
  platformMetadata: { type: Schema.Types.Mixed, default: {} },
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
// Compound unique index — prevents duplicate connections (Requirement 3.4)
// Must be added AFTER the migration script (task 2.2) has backfilled platform on existing records.
SocialAccountSchema.index(
  { workspaceId: 1, platform: 1, accountId: 1 },
  { unique: true, sparse: true, background: true, name: 'workspace_platform_account_unique' }
);

// Compound unique partial index — enforces SocialAccount exclusivity invariant (Requirement 1.5)
// Prevents the same platform+accountId combination from being ACTIVE in more than one workspace
// (workspaceId is the owner-scoping field in this schema, equivalent to ownerId in the design doc)
SocialAccountSchema.index(
  { platform: 1, accountId: 1, workspaceId: 1 },
  {
    unique: true,
    partialFilterExpression: { connectionStatus: 'ACTIVE' },
    name: 'unique_active_account_per_owner',
  }
);

export const SocialAccountModel = mongoose.models.SocialAccount as mongoose.Model<ISocialAccount> || mongoose.model<ISocialAccount>('SocialAccount', SocialAccountSchema, 'socialaccounts');
