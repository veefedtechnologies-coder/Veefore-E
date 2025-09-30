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
  tokenStatus: string;
  lastApiCallTimestamp?: Date;
  rateLimitResetAt?: Date;
  apiCallCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>({
  firebaseUid: { type: String, unique: true, sparse: true },
  email: { type: String, required: true, unique: true },
  username: { type: String, required: true, unique: true },
  displayName: String,
  avatar: String,
  credits: { type: Number, default: 0 },
  plan: { type: String, default: 'Free' },
  stripeCustomerId: String,
  stripeSubscriptionId: String,
  referralCode: { type: String, unique: true },
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
  apiCallCount: { type: Number, default: 0 }
}, {
  timestamps: true
});

// Indexes (email and username already indexed via unique: true)
UserSchema.index({ status: 1 });
UserSchema.index({ plan: 1 });
UserSchema.index({ createdAt: -1 });
UserSchema.index({ lastLoginAt: -1 });

// Virtual for full name
UserSchema.virtual('fullName').get(function() {
  return this.displayName || this.username;
});

// Virtual for first name (for compatibility with frontend)
UserSchema.virtual('firstName').get(function() {
  return this.displayName?.split(' ')[0] || this.username;
});

// Virtual for last name (for compatibility with frontend)
UserSchema.virtual('lastName').get(function() {
  const parts = this.displayName?.split(' ');
  return parts && parts.length > 1 ? parts.slice(1).join(' ') : '';
});

// Virtual for isActive (based on status)
UserSchema.virtual('isActive').get(function() {
  return this.status === 'launched' || this.status === 'early_access';
});

// Virtual for isBanned (not used in main app, but for compatibility)
UserSchema.virtual('isBanned').get(function() {
  return false;
});

// Virtual for subscription (mapped from plan)
UserSchema.virtual('subscription').get(function() {
  return {
    plan: this.plan.toLowerCase(),
    status: 'active',
    currentPeriodStart: this.createdAt,
    currentPeriodEnd: this.trialExpiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    cancelAtPeriodEnd: false
  };
});

// Virtual for creditsInfo (mapped from credits field)
UserSchema.virtual('creditsInfo').get(function() {
  return {
    total: this.credits,
    used: 0,
    remaining: this.credits
  };
});

// Virtual for socialMedia (mapped from socialPlatforms)
UserSchema.virtual('socialMedia').get(function() {
  return {
    platforms: this.socialPlatforms.reduce((acc, platform) => {
      acc[platform.name] = {
        handle: platform.handle || '',
        followers: platform.followers || 0,
        verified: platform.verified || false,
        connected: platform.connected || false
      };
      return acc;
    }, {})
  };
});

// Virtual for userPreferences
UserSchema.virtual('userPreferences').get(function() {
  return {
    language: this.preferences?.language || 'en',
    timezone: this.preferences?.timezone || 'UTC',
    notifications: {
      email: this.preferences?.notifications?.email !== false,
      push: this.preferences?.notifications?.push || false,
      sms: this.preferences?.notifications?.sms || false
    }
  };
});

// Virtual for lastLoginDate
UserSchema.virtual('lastLoginDate').get(function() {
  return this.lastLoginAt;
});

// Virtual for loginCount
UserSchema.virtual('loginCount').get(function() {
  return this.dailyLoginStreak;
});

export default mongoose.model<IUser>('User', UserSchema);