import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
  firebaseUid?: string;
  email: string;
  username: string;
  displayName?: string;
  avatar?: string;
  credits: number;
  plan: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  referralCode?: string;
  totalReferrals: number;
  totalEarned: number;
  referredBy?: string;
  preferences: Record<string, any>;
  isOnboarded: boolean;
  onboardingCompletedAt?: Date;
  isEmailVerified: boolean;
  emailVerificationCode?: string;
  emailVerificationExpiry?: Date;
  onboardingStep: number;
  onboardingData: Record<string, any>;
  goals: any[];
  niche?: string;
  targetAudience?: string;
  contentStyle?: string;
  postingFrequency?: string;
  socialPlatforms: any[];
  businessType?: string;
  experienceLevel?: string;
  primaryObjective?: string;
  status: string;
  trialExpiresAt?: Date;
  discountCode?: string;
  discountExpiresAt?: Date;
  hasUsedWaitlistBonus: boolean;
  dailyLoginStreak: number;
  lastLoginAt?: Date;
  feedbackSubmittedAt?: Date;
  workspaceId?: string;
  instagramToken?: string;
  instagramRefreshToken?: string;
  instagramTokenExpiry?: Date;
  instagramAccountId?: string;
  instagramUsername?: string;
  tokenStatus: 'active' | 'expired' | 'rate_limited' | 'invalid';
  lastApiCallTimestamp?: Date;
  rateLimitResetAt?: Date;
  apiCallCount: number;
  // OAuth fields for server-side OAuth implementation
  googleId?: string;                    // Google user identifier
  refreshToken?: string;                // Encrypted refresh token
  refreshTokenIV?: string;              // Encryption initialization vector
  refreshTokenTag?: string;             // GCM authentication tag
  refreshTokenKeyVersion?: string;      // Key version for graceful SESSION_SECRET rotation
  refreshTokenCreatedAt?: Date;         // Token creation timestamp
  sessionVersion: number;               // Session version for emergency session invalidation
  createdAt: Date;
  updatedAt: Date;
}

export const UserSchema = new Schema<IUser>({
  firebaseUid: { type: String },
  email: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  displayName: String,
  avatar: String,
  credits: { type: Number, default: 0 },
  plan: { type: String, default: 'Free' },
  stripeCustomerId: String,
  stripeSubscriptionId: String,
  referralCode: { type: String },
  totalReferrals: { type: Number, default: 0 },
  totalEarned: { type: Number, default: 0 },
  referredBy: String,
  preferences: { type: Schema.Types.Mixed, default: {} },
  isOnboarded: { type: Boolean, default: false },
  onboardingCompletedAt: Date,
  isEmailVerified: { type: Boolean, default: false },
  emailVerificationCode: String,
  emailVerificationExpiry: Date,
  onboardingStep: { type: Number, default: 1 },
  onboardingData: { type: Schema.Types.Mixed, default: {} },
  goals: { type: Schema.Types.Mixed, default: [] },
  niche: String,
  targetAudience: String,
  contentStyle: String,
  postingFrequency: String,
  socialPlatforms: { type: Schema.Types.Mixed, default: [] },
  businessType: String,
  experienceLevel: String,
  primaryObjective: String,
  status: { type: String, default: 'waitlisted' },
  trialExpiresAt: Date,
  discountCode: String,
  discountExpiresAt: Date,
  hasUsedWaitlistBonus: { type: Boolean, default: false },
  dailyLoginStreak: { type: Number, default: 0 },
  lastLoginAt: Date,
  feedbackSubmittedAt: Date,
  workspaceId: { type: String, index: true },
  instagramToken: String,
  instagramRefreshToken: String,
  instagramTokenExpiry: Date,
  instagramAccountId: String,
  instagramUsername: String,
  tokenStatus: { type: String, enum: ['active', 'expired', 'rate_limited', 'invalid'], default: 'active' },
  lastApiCallTimestamp: Date,
  rateLimitResetAt: Date,
  apiCallCount: { type: Number, default: 0 },
  // OAuth fields for server-side OAuth implementation
  googleId: { type: String, index: true, sparse: true },
  refreshToken: { type: String },
  refreshTokenIV: { type: String },
  refreshTokenTag: { type: String },
  refreshTokenKeyVersion: { type: String }, // Key version for graceful SESSION_SECRET rotation
  refreshTokenCreatedAt: { type: Date },
  sessionVersion: { type: Number, default: 1 }, // Session version for emergency session invalidation
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

UserSchema.index({ firebaseUid: 1 }, { unique: true, sparse: true, background: true });
UserSchema.index({ email: 1 }, { unique: true, background: true });
UserSchema.index({ referralCode: 1 }, { unique: true, sparse: true, background: true });
UserSchema.index({ status: 1 }, { background: true });
UserSchema.index({ createdAt: -1 }, { background: true });
UserSchema.index({ status: 1, plan: 1 }, { background: true });
UserSchema.index({ lastLoginAt: -1 }, { background: true });
UserSchema.index({ stripeCustomerId: 1 }, { sparse: true, background: true });
// OAuth indexes
UserSchema.index({ googleId: 1 }, { unique: true, sparse: true, background: true });
UserSchema.index({ email: 1, googleId: 1 }, { background: true });
// TTL index for automatic refresh token cleanup (90 days)
UserSchema.index(
  { refreshTokenCreatedAt: 1 },
  {
    expireAfterSeconds: 90 * 24 * 60 * 60, // 90 days
    partialFilterExpression: { refreshTokenCreatedAt: { $exists: true } },
    background: true,
  }
);

export const User = mongoose.models.User as mongoose.Model<IUser> || mongoose.model<IUser>('User', UserSchema);
