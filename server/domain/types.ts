/**
 * MongoDB-native domain types
 * 
 * These types use string IDs (ObjectId) instead of numeric IDs,
 * matching what MongoDB actually stores.
 */

// ============================================================================
// USER TYPES
// ============================================================================
export interface User {
  id: string;
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

export interface InsertUser {
  firebaseUid?: string;
  email: string;
  username: string;
  displayName?: string;
  avatar?: string;
  credits?: number;
  plan?: string;
  referralCode?: string;
  referredBy?: string;
  preferences?: Record<string, any>;
  status?: string;
}

// ============================================================================
// WORKSPACE TYPES
// ============================================================================
export interface Workspace {
  id: string;
  userId: string;
  name: string;
  description?: string;
  avatar?: string;
  credits: number;
  theme: string;
  aiPersonality: string;
  isDefault: boolean;
  maxTeamMembers: number;
  inviteCode?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertWorkspace {
  userId: string;
  name: string;
  description?: string;
  avatar?: string;
  credits?: number;
  theme?: string;
  aiPersonality?: string;
  isDefault?: boolean;
  maxTeamMembers?: number;
  inviteCode?: string;
}

// ============================================================================
// WORKSPACE MEMBER TYPES
// ============================================================================
export interface WorkspaceMember {
  id: string;
  userId: string;
  workspaceId: string;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
  status: string;
  permissions: Record<string, any>;
  invitedBy?: string;
  joinedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertWorkspaceMember {
  userId: string;
  workspaceId: string;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
  status?: string;
  permissions?: Record<string, any>;
  invitedBy?: string;
}

// ============================================================================
// TEAM INVITATION TYPES
// ============================================================================
export interface TeamInvitation {
  id: string;
  workspaceId: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
  status: string;
  token: string;
  expiresAt: Date;
  invitedBy: string;
  permissions: Record<string, any>;
  acceptedAt?: Date;
  createdAt: Date;
}

export interface InsertTeamInvitation {
  workspaceId: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
  status?: string;
  token: string;
  expiresAt: Date;
  invitedBy: string;
  permissions?: Record<string, any>;
}

// ============================================================================
// SOCIAL ACCOUNT TYPES
// ============================================================================
export interface SocialAccount {
  id: string;
  workspaceId: string;
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

export interface InsertSocialAccount {
  workspaceId: string;
  platform: string;
  username: string;
  accountId?: string;
  pageId?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: Date;
  isActive?: boolean;
}

// ============================================================================
// CONTENT TYPES
// ============================================================================
export interface Content {
  id: string;
  workspaceId: string;
  type: string;
  title: string;
  description?: string;
  contentData: Record<string, any>;
  platform?: string;
  status: string;
  scheduledAt?: Date;
  publishedAt?: Date;
  creditsUsed: number;
  prompt?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertContent {
  workspaceId: string;
  type: string;
  title: string;
  description?: string;
  contentData?: Record<string, any>;
  platform?: string;
  status?: string;
  scheduledAt?: Date;
  creditsUsed?: number;
  prompt?: string;
}

// ============================================================================
// ANALYTICS TYPES
// ============================================================================
export interface Analytics {
  id: string;
  workspaceId: string;
  platform: string;
  date: Date;
  metrics: Record<string, any>;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  followers: number;
  engagement: number;
  reach: number;
  createdAt: Date;
}

export interface InsertAnalytics {
  workspaceId: string;
  platform: string;
  date: Date;
  metrics?: Record<string, any>;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  followers?: number;
  engagement?: number;
  reach?: number;
}

// ============================================================================
// AUTOMATION RULE TYPES
// ============================================================================
export interface AutomationRule {
  id: string;
  name: string;
  workspaceId: string;
  description?: string;
  isActive: boolean;
  type?: string;
  postInteraction?: boolean;
  platform?: string;
  keywords?: string[];
  responses?: any;
  targetMediaIds?: string[];
  trigger: Record<string, any>;
  triggers: Record<string, any>;
  action: Record<string, any>;
  lastRun?: Date;
  nextRun?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertAutomationRule {
  name: string;
  workspaceId: string;
  description?: string;
  isActive?: boolean;
  type?: string;
  postInteraction?: boolean;
  platform?: string;
  keywords?: string[];
  responses?: any;
  targetMediaIds?: string[];
  trigger?: Record<string, any>;
  triggers?: Record<string, any>;
  action?: Record<string, any>;
}

// ============================================================================
// CREDIT TRANSACTION TYPES
// ============================================================================
export interface CreditTransaction {
  id: string;
  userId: string;
  amount: number;
  type: string;
  description: string;
  workspaceId?: string;
  referenceId?: string;
  createdAt: Date;
}

export interface InsertCreditTransaction {
  userId: string;
  amount: number;
  type: string;
  description: string;
  workspaceId?: string;
  referenceId?: string;
}

// ============================================================================
// SUBSCRIPTION TYPES
// ============================================================================
export interface Subscription {
  id: string;
  userId: string;
  plan: string;
  status: string;
  priceId?: string;
  subscriptionId?: string;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  monthlyCredits: number;
  extraCredits: number;
  autoRenew: boolean;
  canceledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertSubscription {
  userId: string;
  plan: string;
  status: string;
  priceId?: string;
  subscriptionId?: string;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  monthlyCredits?: number;
  extraCredits?: number;
  autoRenew?: boolean;
}

// ============================================================================
// PAYMENT TYPES
// ============================================================================
export interface Payment {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  status: string;
  razorpayOrderId: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  purpose: string;
  metadata?: any;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertPayment {
  userId: string;
  amount: number;
  currency?: string;
  status: string;
  razorpayOrderId: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  purpose: string;
  metadata?: any;
}

// ============================================================================
// AUDIT LOG TYPES
// ============================================================================
export type ActorType = 'admin' | 'user' | 'system';

export interface AuditLog {
  id: string;
  actorType: ActorType;
  actorId: string;
  adminId?: number;
  action: string;
  resource: string;
  resourceId?: string;
  workspaceId?: string;
  oldValues?: any;
  newValues?: any;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  severity?: 'info' | 'warning' | 'critical';
  archived?: boolean;
  archivedAt?: Date;
  createdAt: Date;
}

export interface InsertAuditLog {
  actorType: ActorType;
  actorId: string;
  adminId?: number;
  action: string;
  resource: string;
  resourceId?: string;
  workspaceId?: string;
  oldValues?: any;
  newValues?: any;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  severity?: 'info' | 'warning' | 'critical';
}

// ============================================================================
// SCHEDULED POST TYPES
// ============================================================================
export interface ScheduledPost {
  id: string;
  workspaceId: string;
  socialAccountId: string;
  contentId?: string;
  platform: string;
  content: string;
  mediaUrls?: string[];
  scheduledAt: Date;
  status: string;
  publishedAt?: Date;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertScheduledPost {
  workspaceId: string;
  socialAccountId: string;
  contentId?: string;
  platform: string;
  content: string;
  mediaUrls?: string[];
  scheduledAt: Date;
  status?: string;
}

// ============================================================================
// AI CHAT TYPES
// ============================================================================
export interface AIChat {
  id: string;
  workspaceId: string;
  title: string;
  messages: any[];
  model?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertAIChat {
  workspaceId: string;
  title?: string;
  messages?: any[];
  model?: string;
}

// ============================================================================
// NOTIFICATION TYPES
// ============================================================================
export interface Notification {
  id: string;
  userId: string;
  workspaceId?: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, any>;
  isRead: boolean;
  readAt?: Date;
  createdAt: Date;
}

export interface InsertNotification {
  userId: string;
  workspaceId?: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, any>;
  isRead?: boolean;
}

// ============================================================================
// MEDIA ASSET TYPES
// ============================================================================
export interface MediaAsset {
  id: string;
  workspaceId: string;
  type: string;
  url: string;
  filename: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  duration?: number;
  thumbnailUrl?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertMediaAsset {
  workspaceId: string;
  type: string;
  url: string;
  filename: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  duration?: number;
  thumbnailUrl?: string;
  metadata?: Record<string, any>;
}

// ============================================================================
// WAITLIST TYPES
// ============================================================================
export interface WaitlistEntry {
  id: string;
  email: string;
  referralCode?: string;
  referredBy?: string;
  status: string;
  position?: number;
  metadata?: Record<string, any>;
  approvedAt?: Date;
  createdAt: Date;
}

export interface InsertWaitlistEntry {
  email: string;
  referralCode?: string;
  referredBy?: string;
  status?: string;
  position?: number;
  metadata?: Record<string, any>;
}
