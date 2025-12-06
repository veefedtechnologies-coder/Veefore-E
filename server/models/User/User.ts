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
  createdAt: Date;
  updatedAt: Date;
}

export const UserSchema = new Schema<IUser>({
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
  apiCallCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

export const User = mongoose.models.User as mongoose.Model<IUser> || mongoose.model<IUser>('User', UserSchema);
