import mongoose from 'mongoose';

// Schema for the main app's User model
export const MainAppUserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  displayName: {
    type: String,
    trim: true
  },
  avatar: {
    type: String,
    default: null
  },
  plan: {
    type: String,
    enum: ['Free', 'Starter', 'Pro', 'Business', 'Enterprise', 'free', 'starter', 'pro', 'business', 'enterprise'],
    default: 'Free'
  },
  status: {
    type: String,
    enum: ['waitlisted', 'early_access', 'launched', 'banned'],
    default: 'waitlisted'
  },
  credits: {
    type: Number,
    default: 0
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  isBanned: {
    type: Boolean,
    default: false
  },
  onboardingStep: {
    type: Number,
    default: 1
  },
  onboardingData: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  goals: [{
    type: String
  }],
  hasUsedWaitlistBonus: {
    type: Boolean,
    default: false
  },
  dailyLoginStreak: {
    type: Number,
    default: 0
  },
  lastLoginAt: {
    type: Date,
    default: null
  },
  tokenStatus: {
    type: String,
    enum: ['active', 'expired', 'revoked'],
    default: 'active'
  },
  socialPlatforms: [{
    platform: String,
    username: String,
    handle: String,
    followers: Number,
    followersCount: Number,
    verified: Boolean,
    isVerified: Boolean,
    connected: Boolean,
    isActive: Boolean,
    accountId: String,
    pageId: String,
    workspaceId: String
  }],
  preferences: {
    language: {
      type: String,
      default: 'en'
    },
    timezone: {
      type: String,
      default: 'UTC'
    },
    notifications: {
      email: {
        type: Boolean,
        default: true
      },
      push: {
        type: Boolean,
        default: false
      },
      sms: {
        type: Boolean,
        default: false
      }
    }
  },
  trialExpiresAt: {
    type: Date,
    default: null
  },
  // Analytics fields
  aiUsage: {
    totalCreditsUsed: { type: Number, default: 0 },
    imageGeneration: {
      count: { type: Number, default: 0 },
      creditsUsed: { type: Number, default: 0 }
    },
    videoGeneration: {
      count: { type: Number, default: 0 },
      creditsUsed: { type: Number, default: 0 }
    },
    captionGeneration: {
      count: { type: Number, default: 0 },
      creditsUsed: { type: Number, default: 0 }
    },
    hashtagGeneration: {
      count: { type: Number, default: 0 },
      creditsUsed: { type: Number, default: 0 }
    },
    contentOptimization: {
      count: { type: Number, default: 0 },
      creditsUsed: { type: Number, default: 0 }
    },
    lastUsed: { type: Date, default: null }
  },
  contentStats: {
    totalCreated: { type: Number, default: 0 },
    images: {
      count: { type: Number, default: 0 },
      aiGenerated: { type: Number, default: 0 }
    },
    videos: {
      count: { type: Number, default: 0 },
      aiGenerated: { type: Number, default: 0 }
    },
    captions: {
      count: { type: Number, default: 0 },
      aiGenerated: { type: Number, default: 0 }
    },
    hashtags: {
      count: { type: Number, default: 0 },
      aiGenerated: { type: Number, default: 0 }
    },
    lastCreated: { type: Date, default: null }
  },
  growthStats: {
    totalFollowers: { type: Number, default: 0 },
    followerGrowth: {
      daily: { type: Number, default: 0 },
      weekly: { type: Number, default: 0 },
      monthly: { type: Number, default: 0 }
    },
    engagementRate: { type: Number, default: 0 },
    reach: { type: Number, default: 0 },
    impressions: { type: Number, default: 0 },
    lastCalculated: { type: Date, default: null }
  },
  revenueStats: {
    totalSpent: { type: Number, default: 0 },
    subscriptionRevenue: { type: Number, default: 0 },
    creditPurchases: { type: Number, default: 0 },
    lifetimeValue: { type: Number, default: 0 },
    lastPayment: { type: Date, default: null }
  },
  activityStats: {
    totalSessions: { type: Number, default: 0 },
    averageSessionDuration: { type: Number, default: 0 },
    timeSpentToday: { type: Number, default: 0 },
    timeSpentThisWeek: { type: Number, default: 0 },
    timeSpentThisMonth: { type: Number, default: 0 },
    lastActiveAt: { type: Date, default: null }
  },
  workspaceCount: { type: Number, default: 1 },
  workspaceIds: [{ type: String }],
  notes: [{ type: String }],
  accountStatus: { type: String, default: 'active' },
  suspensionReason: { type: String, default: null },
  suspendedAt: { type: Date, default: null }
}, {
  timestamps: true,
  collection: 'users'
});

// Indexes (email and username already indexed via unique: true)
MainAppUserSchema.index({ status: 1 });
MainAppUserSchema.index({ plan: 1 });
MainAppUserSchema.index({ createdAt: -1 });

export default mongoose.model('MainAppUser', MainAppUserSchema);
