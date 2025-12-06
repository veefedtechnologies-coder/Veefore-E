import mongoose from "mongoose";
import { ObjectId } from "mongodb";
import { IStorage } from "./storage";
import {
  User, Workspace, SocialAccount, Content, Analytics, AutomationRule,
  Suggestion, CreditTransaction, Referral, Subscription, Payment, Addon,
  WorkspaceMember, TeamInvitation, ContentRecommendation, UserContentHistory,
  Admin, AdminSession, Notification, Popup, AppSetting, AuditLog, FeedbackMessage,
  CreativeBrief, ContentRepurpose, CompetitorAnalysis,
  InsertUser, InsertWorkspace, InsertSocialAccount, InsertContent,
  InsertAutomationRule, InsertAnalytics, InsertSuggestion,
  InsertCreditTransaction, InsertReferral, InsertSubscription, InsertPayment, InsertAddon,
  InsertWorkspaceMember, InsertTeamInvitation, InsertContentRecommendation, InsertUserContentHistory,
  InsertAdmin, InsertAdminSession, InsertNotification, InsertPopup, InsertAppSetting, InsertAuditLog, InsertFeedbackMessage,
  InsertCreativeBrief, InsertContentRepurpose, InsertCompetitorAnalysis,
  WaitlistUser, InsertWaitlistUser
} from "@shared/schema";
import { tokenEncryption, EncryptedToken } from './security/token-encryption';

// MongoDB Schemas
const UserSchema = new mongoose.Schema({
  firebaseUid: { type: String, unique: true, sparse: true }, // Made optional for email verification users
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
  preferences: { type: mongoose.Schema.Types.Mixed, default: {} },
  isOnboarded: { type: Boolean, default: false },
  onboardingCompletedAt: Date,
  isEmailVerified: { type: Boolean, default: false },
  emailVerificationCode: String,
  emailVerificationExpiry: Date,
  onboardingStep: { type: Number, default: 1 },
  onboardingData: { type: mongoose.Schema.Types.Mixed, default: {} },
  goals: { type: mongoose.Schema.Types.Mixed, default: [] },
  niche: String,
  targetAudience: String,
  contentStyle: String,
  postingFrequency: String,
  socialPlatforms: { type: mongoose.Schema.Types.Mixed, default: [] },
  businessType: String,
  experienceLevel: String,
  primaryObjective: String,
  // Early access fields
  status: { type: String, default: 'waitlisted' }, // waitlisted, early_access, launched
  trialExpiresAt: Date,
  discountCode: String,
  discountExpiresAt: Date,
  hasUsedWaitlistBonus: { type: Boolean, default: false },
  dailyLoginStreak: { type: Number, default: 0 },
  lastLoginAt: Date,
  feedbackSubmittedAt: Date,
  // Instagram integration fields
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

// Waitlist Users Schema
const WaitlistUserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  referralCode: { type: String, required: true, unique: true },
  referredBy: String, // referral code of referrer
  referralCount: { type: Number, default: 0 },
  credits: { type: Number, default: 0 },
  status: { type: String, default: 'waitlisted' }, // waitlisted, early_access, launched
  discountCode: String, // 50% off first month
  discountExpiresAt: Date,
  dailyLogins: { type: Number, default: 0 },
  feedbackSubmitted: { type: Boolean, default: false },
  joinedAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
});

const WorkspaceSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.Mixed, required: true },
  name: { type: String, required: true },
  description: String,
  avatar: String,
  credits: { type: Number, default: 0 },
  theme: { type: String, default: 'space' },
  aiPersonality: { type: String, default: 'professional' },
  isDefault: { type: Boolean, default: false },
  maxTeamMembers: { type: Number, default: 1 },
  inviteCode: { type: String, unique: true, sparse: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const SocialAccountSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.Mixed, required: true },
  platform: { type: String, required: true },
  username: { type: String, required: true },
  accountId: String,
  pageId: String,
  // SECURITY: Store tokens in encrypted format
  accessToken: String, // Legacy: plain text tokens (being migrated)
  refreshToken: String, // Legacy: plain text tokens (being migrated)
  // New encrypted token storage
  encryptedAccessToken: { type: mongoose.Schema.Types.Mixed, default: null },
  encryptedRefreshToken: { type: mongoose.Schema.Types.Mixed, default: null },
  expiresAt: Date,
  tokenStatus: { type: String, default: 'valid' },
  isActive: { type: Boolean, default: true },
  // Instagram sync data fields
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
  // Instagram Business API engagement totals
  totalLikes: { type: Number, default: 0 },
  totalComments: { type: Number, default: 0 },
  totalReach: { type: Number, default: 0 },
  avgEngagement: { type: Number, default: 0 },
  // Additional engagement totals
  totalShares: { type: Number, default: 0 },
  totalSaves: { type: Number, default: 0 },
  lastSyncAt: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Critical indexes for SocialAccount
SocialAccountSchema.index({ accountId: 1 }); // For webhook queries (instagramAccountId lookup)
SocialAccountSchema.index({ workspaceId: 1, platform: 1 }); // For workspace-specific queries

const ContentSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.Mixed, required: true },
  type: { type: String, required: true },
  title: { type: String, required: true },
  description: String,
  contentData: { type: mongoose.Schema.Types.Mixed, default: {} },
  platform: String,
  status: { type: String, default: 'draft' },
  scheduledAt: Date,
  publishedAt: Date,
  creditsUsed: { type: Number, default: 0 },
  prompt: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Critical indexes for Content
ContentSchema.index({ workspaceId: 1, status: 1, scheduledAt: 1 }); // For scheduler queries
ContentSchema.index({ workspaceId: 1, createdAt: -1 }); // For listing content by workspace

const AnalyticsSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.Mixed, required: true },
  platform: { type: String, required: true },
  date: { type: Date, required: true },
  metrics: { type: mongoose.Schema.Types.Mixed, default: {} },
  views: { type: Number, default: 0 },
  likes: { type: Number, default: 0 },
  comments: { type: Number, default: 0 },
  shares: { type: Number, default: 0 },
  followers: { type: Number, default: 0 },
  engagement: { type: Number, default: 0 },
  reach: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

// Critical indexes for Analytics
AnalyticsSchema.index({ workspaceId: 1, platform: 1, date: -1 }); // For analytics queries by date range
AnalyticsSchema.index({ workspaceId: 1, date: -1 }); // For workspace-wide analytics

const SuggestionSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.Mixed, required: true },
  type: { type: String, required: true },
  data: { type: mongoose.Schema.Types.Mixed, required: true },
  confidence: { type: Number, default: 0.8 },
  isUsed: { type: Boolean, default: false },
  validUntil: Date,
  createdAt: { type: Date, default: Date.now }
});

const CreditTransactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.Mixed, required: true },
  amount: { type: Number, required: true },
  type: { type: String, required: true },
  description: { type: String, required: true },
  workspaceId: { type: mongoose.Schema.Types.Mixed },
  referenceId: { type: String },
  createdAt: { type: Date, default: Date.now }
});

const ReferralSchema = new mongoose.Schema({
  referrerId: { type: Number, required: true },
  referredUserId: Number,
  referralCode: { type: String, required: true },
  status: { type: String, default: 'pending' },
  rewardAmount: { type: Number, default: 100 },
  isConfirmed: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const SubscriptionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.Mixed, required: true },
  plan: { type: String, required: true },
  status: { type: String, required: true },
  priceId: String,
  subscriptionId: String,
  currentPeriodStart: Date,
  currentPeriodEnd: Date,
  monthlyCredits: { type: Number, default: 0 },
  extraCredits: { type: Number, default: 0 },
  autoRenew: { type: Boolean, default: true },
  canceledAt: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const PaymentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.Mixed, required: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  status: { type: String, required: true },
  razorpayOrderId: { type: String, required: true },
  razorpayPaymentId: String,
  razorpaySignature: String,
  purpose: { type: String, required: true },
  metadata: mongoose.Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const AddonSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.Mixed, required: true },
  type: { type: String, required: true },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  isActive: { type: Boolean, default: true },
  expiresAt: Date,
  metadata: mongoose.Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const WorkspaceMemberSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.Mixed, required: true },
  workspaceId: { type: mongoose.Schema.Types.Mixed, required: true },
  role: { type: String, required: true, enum: ['owner', 'admin', 'editor', 'viewer'] },
  status: { type: String, default: 'active' },
  permissions: { type: mongoose.Schema.Types.Mixed, default: {} },
  invitedBy: { type: mongoose.Schema.Types.Mixed },
  joinedAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const TeamInvitationSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.Mixed, required: true },
  email: { type: String, required: true },
  role: { type: String, required: true, enum: ['admin', 'editor', 'viewer'] },
  status: { type: String, default: 'pending' },
  token: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  invitedBy: { type: mongoose.Schema.Types.Mixed, required: true },
  permissions: { type: mongoose.Schema.Types.Mixed, default: {} },
  acceptedAt: Date,
  createdAt: { type: Date, default: Date.now }
});

const ContentRecommendationSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.Mixed, required: true },
  type: { type: String, required: true },
  title: { type: String, required: true },
  description: String,
  thumbnailUrl: String,
  mediaUrl: String,
  duration: Number,
  category: { type: String, required: true },
  country: { type: String, required: true },
  tags: [String],
  engagement: {
    expectedViews: { type: Number, default: 0 },
    expectedLikes: { type: Number, default: 0 },
    expectedShares: { type: Number, default: 0 }
  },
  sourceUrl: String,
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const UserContentHistorySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.Mixed, required: true },
  workspaceId: { type: mongoose.Schema.Types.Mixed, required: true },
  recommendationId: { type: mongoose.Schema.Types.Mixed },
  action: { type: String, required: true },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now }
});

const FeatureUsageSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.Mixed, required: true },
  featureId: { type: String, required: true },
  usageCount: { type: Number, default: 0 },
  lastUsed: { type: Date, default: Date.now },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// DM Conversation Memory Schemas
const DmConversationSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.Mixed, required: true },
  platform: { type: String, required: true },
  participantId: { type: String, required: true },
  participantUsername: String,
  lastMessageAt: { type: Date, default: Date.now },
  messageCount: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const DmMessageSchema = new mongoose.Schema({
  conversationId: { type: mongoose.Schema.Types.Mixed, required: true },
  messageId: String,
  sender: { type: String, required: true, enum: ['user', 'ai'] },
  content: { type: String, required: true },
  messageType: { type: String, default: 'text' },
  sentiment: String,
  topics: [String],
  aiResponse: { type: Boolean, default: false },
  automationRuleId: { type: mongoose.Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now }
});

const ConversationContextSchema = new mongoose.Schema({
  conversationId: { type: mongoose.Schema.Types.Mixed, required: true },
  contextType: { type: String, required: true },
  contextValue: { type: String, required: true },
  confidence: { type: Number, default: 100 },
  extractedAt: { type: Date, default: Date.now },
  expiresAt: Date
});

const AutomationRuleSchema = new mongoose.Schema({
  name: { type: String, required: true },
  workspaceId: { type: mongoose.Schema.Types.Mixed, required: true },
  description: { type: String },
  isActive: { type: Boolean, default: true },
  type: { type: String }, // Rule type (dm, comment, etc.)
  postInteraction: { type: Boolean }, // For comment-to-DM detection
  platform: { type: String }, // Platform (instagram, etc.)
  keywords: [{ type: String }], // Keywords for triggering
  responses: { type: mongoose.Schema.Types.Mixed }, // Response templates (can be array or object)
  targetMediaIds: [{ type: String }], // Target post/media IDs
  trigger: { type: mongoose.Schema.Types.Mixed, default: {} },
  triggers: { type: mongoose.Schema.Types.Mixed, default: {} }, // Alternative triggers format
  action: { type: mongoose.Schema.Types.Mixed, default: {} },
  lastRun: { type: Date },
  nextRun: { type: Date },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// VeeGPT Chat schemas  
const ChatConversationSchema = new mongoose.Schema({
  id: { type: Number, unique: true },
  userId: { type: String, required: true },
  workspaceId: { type: String, required: true },
  title: { type: String, required: true, default: "New chat" },
  messageCount: { type: Number, default: 0 },
  lastMessageAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const ChatMessageSchema = new mongoose.Schema({
  id: { type: Number, unique: true },
  conversationId: { type: Number, required: true },
  role: { type: String, required: true, enum: ['user', 'assistant'] },
  content: { type: String, required: true },
  tokensUsed: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

// Admin schemas
const AdminSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, required: true, enum: ['admin', 'superadmin'], default: 'admin' },
  isActive: { type: Boolean, default: true },
  lastLogin: { type: Date },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const AdminSessionSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  token: { type: String, required: true, unique: true },
  ipAddress: String,
  userAgent: String,
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now }
});

const NotificationSchema = new mongoose.Schema({
  userId: { type: Number },
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: { type: String, required: true },
  priority: { type: String, default: 'medium' },
  isRead: { type: Boolean, default: false },
  actionUrl: String,
  data: { type: mongoose.Schema.Types.Mixed },
  expiresAt: Date,
  targetUsers: { type: mongoose.Schema.Types.Mixed, default: 'all' },
  scheduledFor: Date,
  sentAt: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const PopupSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, required: true },
  type: { type: String, required: true },
  priority: { type: String, default: 'medium' },
  isActive: { type: Boolean, default: true },
  targetUserType: String,
  displayConditions: { type: mongoose.Schema.Types.Mixed },
  actionButton: { type: mongoose.Schema.Types.Mixed },
  startDate: Date,
  endDate: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const AppSettingSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: String, required: true },
  description: String,
  category: String,
  isPublic: { type: Boolean, default: false },
  updatedBy: Number,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const AuditLogSchema = new mongoose.Schema({
  adminId: { type: Number, required: true },
  action: { type: String, required: true },
  resource: { type: String, required: true },
  resourceId: String,
  oldValues: { type: mongoose.Schema.Types.Mixed },
  newValues: { type: mongoose.Schema.Types.Mixed },
  ipAddress: String,
  userAgent: String,
  createdAt: { type: Date, default: Date.now }
});

const FeedbackMessageSchema = new mongoose.Schema({
  userId: Number,
  name: String,
  email: String,
  subject: { type: String, required: true },
  message: { type: String, required: true },
  type: { type: String, required: true },
  status: { type: String, default: 'pending' },
  adminResponse: String,
  respondedBy: Number,
  respondedAt: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// AI Features Schemas
const CreativeBriefSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.Mixed, required: true },
  userId: { type: mongoose.Schema.Types.Mixed, required: true },
  title: { type: String, required: true },
  targetAudience: { type: String, required: true },
  platforms: { type: mongoose.Schema.Types.Mixed, required: true }, // JSON array
  campaignGoals: { type: mongoose.Schema.Types.Mixed, required: true }, // JSON array
  tone: { type: String, required: true },
  style: { type: String, required: true },
  industry: { type: String, required: true },
  deadline: Date,
  budget: Number,
  briefContent: { type: String, required: true }, // AI-generated content
  keyMessages: { type: mongoose.Schema.Types.Mixed }, // JSON array
  contentFormats: { type: mongoose.Schema.Types.Mixed }, // JSON array
  hashtags: { type: mongoose.Schema.Types.Mixed }, // JSON array
  references: { type: mongoose.Schema.Types.Mixed }, // JSON array
  status: { type: String, default: 'draft' },
  creditsUsed: { type: Number, default: 5 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const ContentRepurposeSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.Mixed, required: true },
  userId: { type: mongoose.Schema.Types.Mixed, required: true },
  originalContentId: { type: mongoose.Schema.Types.Mixed },
  sourceLanguage: { type: String, required: true },
  targetLanguage: { type: String, required: true },
  sourceContent: { type: String, required: true },
  repurposedContent: { type: String, required: true },
  contentType: { type: String, required: true },
  culturalAdaptations: { type: mongoose.Schema.Types.Mixed },
  toneAdjustments: { type: mongoose.Schema.Types.Mixed },
  platform: { type: String, required: true },
  qualityScore: Number,
  isApproved: { type: Boolean, default: false },
  creditsUsed: { type: Number, default: 3 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const CompetitorAnalysisSchema = new mongoose.Schema({
  workspaceId: { type: mongoose.Schema.Types.Mixed, required: true },
  userId: { type: mongoose.Schema.Types.Mixed, required: true },
  competitorUsername: { type: String, required: true },
  platform: { type: String, required: true },
  analysisType: { type: String, required: true },
  scrapedData: { type: mongoose.Schema.Types.Mixed, required: true },
  analysisResults: { type: mongoose.Schema.Types.Mixed, required: true },
  topPerformingPosts: { type: mongoose.Schema.Types.Mixed },
  contentPatterns: { type: mongoose.Schema.Types.Mixed },
  hashtags: { type: mongoose.Schema.Types.Mixed },
  postingSchedule: { type: mongoose.Schema.Types.Mixed },
  engagementRate: Number,
  growthRate: Number,
  recommendations: { type: String, required: true },
  competitorScore: Number,
  lastScraped: { type: Date, default: Date.now },
  creditsUsed: { type: Number, default: 8 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// DM Template Schema for Instagram comment webhook automation
const DmTemplateSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  workspaceId: { type: mongoose.Schema.Types.Mixed, required: true },
  messageText: { type: String, required: true },
  buttonText: { type: String, required: true },
  buttonUrl: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// MongoDB Models
const UserModel = mongoose.model('User', UserSchema);
const WaitlistUserModel = mongoose.model('WaitlistUser', WaitlistUserSchema);
const WorkspaceModel = mongoose.model('Workspace', WorkspaceSchema);
const ContentRecommendationModel = mongoose.model('ContentRecommendation', ContentRecommendationSchema);
const UserContentHistoryModel = mongoose.model('UserContentHistory', UserContentHistorySchema);
const FeatureUsageModel = mongoose.model('FeatureUsage', FeatureUsageSchema);
const SocialAccountModel = mongoose.model('SocialAccount', SocialAccountSchema, 'socialaccounts');
const ContentModel = mongoose.model('Content', ContentSchema, 'contents');
const AnalyticsModel = mongoose.model('Analytics', AnalyticsSchema);
const AutomationRuleModel = mongoose.model('AutomationRule', AutomationRuleSchema);
const SuggestionModel = mongoose.model('Suggestion', SuggestionSchema);
const CreditTransactionModel = mongoose.model('CreditTransaction', CreditTransactionSchema);
const ReferralModel = mongoose.model('Referral', ReferralSchema);
const SubscriptionModel = mongoose.model('Subscription', SubscriptionSchema);
const PaymentModel = mongoose.model('Payment', PaymentSchema);
const AddonModel = mongoose.model('Addon', AddonSchema);
const WorkspaceMemberModel = mongoose.model('WorkspaceMember', WorkspaceMemberSchema);
const TeamInvitationModel = mongoose.model('TeamInvitation', TeamInvitationSchema);
const DmConversationModel = mongoose.model('DmConversation', DmConversationSchema);
const DmMessageModel = mongoose.model('DmMessage', DmMessageSchema);
const ConversationContextModel = mongoose.model('ConversationContext', ConversationContextSchema);

// Admin Models
const AdminModel = mongoose.model('Admin', AdminSchema);
const AdminSessionModel = mongoose.model('AdminSession', AdminSessionSchema);
const NotificationModel = mongoose.model('Notification', NotificationSchema);
const PopupModel = mongoose.model('Popup', PopupSchema);
const AppSettingModel = mongoose.model('AppSetting', AppSettingSchema);
const AuditLogModel = mongoose.model('AuditLog', AuditLogSchema);
const FeedbackMessageModel = mongoose.model('FeedbackMessage', FeedbackMessageSchema);

// AI Features Models
const CreativeBriefModel = mongoose.model('CreativeBrief', CreativeBriefSchema);
const ContentRepurposeModel = mongoose.model('ContentRepurpose', ContentRepurposeSchema);
const CompetitorAnalysisModel = mongoose.model('CompetitorAnalysis', CompetitorAnalysisSchema);
const DmTemplateModel = mongoose.model('DmTemplate', DmTemplateSchema, 'dm_templates');

// VeeGPT Chat Models
const ChatConversationModel = mongoose.model('ChatConversation', ChatConversationSchema);
const ChatMessageModel = mongoose.model('ChatMessage', ChatMessageSchema);

export class MongoStorage implements IStorage {
  private isConnected = false;

  // SECURITY: Token encryption helper methods
  /**
   * Securely store a social media token by encrypting it
   */
  private encryptAndStoreToken(plainToken: string | null): EncryptedToken | null {
    if (!plainToken || typeof plainToken !== 'string') {
      return null;
    }
    
    try {
      return tokenEncryption.encryptToken(plainToken);
    } catch (error) {
      console.error('🚨 SECURITY: Failed to encrypt token:', error);
      throw new Error('Token encryption failed');
    }
  }

  /**
   * Securely retrieve and decrypt a social media token with comprehensive error handling
   */
  private decryptStoredToken(encryptedToken: any): string | null {
    if (!encryptedToken) {
      return null;
    }
    
    try {
      // Handle both string (JSON) and object formats
      let tokenData: EncryptedToken;
      
      if (typeof encryptedToken === 'string') {
        try {
          // Parse JSON string from database
          tokenData = JSON.parse(encryptedToken);
        } catch (parseError) {
          console.warn('🚨 P2-FIX: Failed to parse JSON token data, invalid format');
          return null;
        }
      } else if (typeof encryptedToken === 'object') {
        // Already an object
        tokenData = encryptedToken;
      } else {
        console.warn('🚨 P2-FIX: Invalid encrypted token format, expected string or object');
        return null;
      }
      
      // Validate required fields exist
      if (!tokenData.encryptedData || !tokenData.iv || !tokenData.salt || !tokenData.tag) {
        console.warn('🚨 P2-FIX: Incomplete encrypted token data, missing required fields:', {
          hasEncryptedData: !!tokenData.encryptedData,
          hasIV: !!tokenData.iv,
          hasSalt: !!tokenData.salt,
          hasTag: !!tokenData.tag
        });
        return null;
      }
      
      // Attempt decryption with detailed error handling
      const decryptedToken = tokenEncryption.decryptToken(tokenData);
      
      if (!decryptedToken || decryptedToken.trim().length === 0) {
        console.warn('🚨 P2-FIX: Decryption returned empty token');
        return null;
      }
      
      return decryptedToken;
    } catch (error) {
      // Enhanced error logging for debugging
      console.warn('🚨 P2-FIX: Token decryption failed:', {
        error: error.message,
        tokenType: typeof encryptedToken,
        tokenLength: typeof encryptedToken === 'string' ? encryptedToken.length : 'N/A',
        hasBasicStructure: !!(encryptedToken && typeof encryptedToken === 'object')
      });
      return null;
    }
  }

  /**
   * Get access token from social account with automatic migration from plain text
   */
  private getAccessTokenFromAccount(account: any): string | null {
    console.log(`[TOKEN DEBUG] Checking access token for account: ${account.username}`);
    console.log(`[TOKEN DEBUG] Has encryptedAccessToken: ${!!account.encryptedAccessToken}`);
    console.log(`[TOKEN DEBUG] Has plain accessToken: ${!!account.accessToken}`);
    
    // First try encrypted token
    if (account.encryptedAccessToken) {
      console.log(`[TOKEN DEBUG] Attempting to decrypt encrypted token for ${account.username}`);
      try {
        const decryptedToken = this.decryptStoredToken(account.encryptedAccessToken);
        if (decryptedToken) {
          console.log(`[TOKEN DEBUG] ✅ Successfully decrypted token for ${account.username}`);
          return decryptedToken;
        }
        console.warn(`[TOKEN DEBUG] ❌ Decryption returned null for ${account.username}`);
      } catch (error) {
        console.error(`[TOKEN DEBUG] ❌ Decryption failed for ${account.username}:`, error.message);
      }
      // If decryption failed, log and continue to fallback
      console.warn(`🚨 P2-FIX: Failed to decrypt access token for account ${account.username}, falling back to plain text`);
    }
    
    // Fallback to legacy plain text token
    if (account.accessToken) {
      console.log('📊 SECURITY: Found legacy plain text token, should migrate to encrypted storage');
      return account.accessToken;
    }
    
    console.log(`[TOKEN DEBUG] ❌ No valid access token found for ${account.username}`);
    return null;
  }

  /**
   * Get refresh token from social account with automatic migration from plain text
   */
  private getRefreshTokenFromAccount(account: any): string | null {
    // First try encrypted token  
    if (account.encryptedRefreshToken) {
      const decryptedToken = this.decryptStoredToken(account.encryptedRefreshToken);
      if (decryptedToken) {
        return decryptedToken;
      }
      // If decryption failed, log and continue to fallback
      console.warn(`🚨 P2-FIX: Failed to decrypt refresh token for account ${account.username}, falling back to plain text`);
    }
    
    // Fallback to legacy plain text token
    if (account.refreshToken) {
      console.log('📊 SECURITY: Found legacy plain text refresh token, should migrate to encrypted storage');
      return account.refreshToken;
    }
    
    return null;
  }

  async connect() {
    // Don't reconnect if already connected and healthy
    if (this.isConnected && mongoose.connection.readyState === 1) {
      return;
    }
    
    // Don't interrupt existing connection attempts
    if (mongoose.connection.readyState === 2) {
      // Wait for connection in progress
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('MongoDB connection timeout'));
        }, 10000);
        
        mongoose.connection.once('connected', () => {
          clearTimeout(timeout);
          this.isConnected = true;
          resolve(undefined);
        });
        mongoose.connection.once('error', (error) => {
          clearTimeout(timeout);
          this.isConnected = false;
          reject(error);
        });
      });
    }
    
    try {
      // Only disconnect if connection is in bad state
      if (mongoose.connection.readyState === 3) { // Disconnected
        await mongoose.disconnect();
      }
      
      // Use environment variable or fallback to default local MongoDB
      const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb://localhost:27017/veefore';
      console.log('[MONGODB] Attempting to connect to:', mongoUri);
      
      await mongoose.connect(mongoUri, {
        dbName: 'veeforedb',
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        maxPoolSize: 10,
        bufferCommands: false,
        maxIdleTimeMS: 30000,
        retryWrites: true
      });
      
      this.isConnected = true;
      console.log(`✅ Connected to MongoDB - ${mongoose.connection.db?.databaseName} database`);
    } catch (error) {
      console.error('❌ MongoDB connection error:', error);
      this.isConnected = false;
      // Don't throw the error - allow the server to continue with limited functionality
      console.log('⚠️  Server will continue with limited functionality');
    }
  }

  // User operations
  async getUser(id: number | string): Promise<User | undefined> {
    await this.connect();
    
    // Handle both string ObjectIds and numeric IDs
    let query;
    if (typeof id === 'string' && id.length === 24) {
      // It's a MongoDB ObjectId string
      query = { _id: id };
    } else {
      // Try to find by numeric ID field or converted string
      query = { $or: [{ id: id }, { _id: id.toString() }] };
    }
    
    const user = await UserModel.findOne(query);
    return user ? this.convertUser(user) : undefined;
  }

  async getUserByFirebaseUid(firebaseUid: string): Promise<User | undefined> {
    await this.connect();
    console.log(`[MONGODB DEBUG] Looking up user by firebaseUid: ${firebaseUid}`);
    const user = await UserModel.findOne({ firebaseUid });
    if (user) {
      console.log(`[MONGODB DEBUG] Found user:`, {
        id: user._id.toString(),
        email: user.email,
        username: user.username,
        isOnboarded: user.isOnboarded,
        firebaseUid: user.firebaseUid
      });
    } else {
      console.log(`[MONGODB DEBUG] No user found with firebaseUid: ${firebaseUid}`);
    }
    return user ? this.convertUser(user) : undefined;
  }

  async getUserByFirebaseId(firebaseId: string): Promise<User | undefined> {
    await this.connect();
    const user = await UserModel.findOne({ firebaseUid: firebaseId });
    return user ? this.convertUser(user) : undefined;
  }

  async updateUserLastLogin(firebaseId: string): Promise<void> {
    await this.connect();
    await UserModel.findOneAndUpdate(
      { firebaseUid: firebaseId },
      { lastLoginAt: new Date(), updatedAt: new Date() }
    );
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    await this.connect();
    const user = await UserModel.findOne({ email });
    return user ? this.convertUser(user) : undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    await this.connect();
    const user = await UserModel.findOne({ username });
    return user ? this.convertUser(user) : undefined;
  }

  async getUserByReferralCode(referralCode: string): Promise<User | undefined> {
    await this.connect();
    const user = await UserModel.findOne({ referralCode });
    return user ? this.convertUser(user) : undefined;
  }

  async createUser(userData: InsertUser): Promise<User> {
    await this.connect();
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const referralCode = this.generateReferralCode();
      const user = new UserModel({
        ...userData,
        referralCode,
        isOnboarded: false,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      const savedUser = await user.save({ session });
      const convertedUser = this.convertUser(savedUser);
      const existingWorkspaces = await WorkspaceModel.find({ userId: convertedUser.id }).session(session);
      if (existingWorkspaces.length === 0) {
        const name = userData.displayName ? `${userData.displayName}'s Workspace` : 'My VeeFore Workspace';
        const defaultWorkspace = new WorkspaceModel({
          name,
          description: 'Default workspace for social media management',
          userId: convertedUser.id,
          theme: 'space',
          isDefault: true,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        await defaultWorkspace.save({ session });
        console.log(`[USER CREATION] Created default workspace for user ${convertedUser.id}: ${defaultWorkspace._id}`);
      }
      await session.commitTransaction();
      session.endSession();
      return this.convertUser(savedUser);
    } catch (error) {
      console.error('[USER CREATION] Atomic creation failed - rolling back:', error);
      await session.abortTransaction();
      session.endSession();
      throw new Error('Workspace creation failed during signup');
    }
  }

  async updateUser(id: number | string, updates: Partial<User>): Promise<User> {
    await this.connect();
    
    console.log(`[MONGODB DEBUG] Updating user with ID: ${id} (type: ${typeof id})`);
    console.log(`[MONGODB DEBUG] Updates:`, updates);
    
    // Handle both ObjectId strings and numeric IDs
    let user;
    try {
      if (mongoose.Types.ObjectId.isValid(id.toString())) {
        user = await UserModel.findByIdAndUpdate(
          id.toString(),
          { ...updates, updatedAt: new Date() },
          { new: true }
        );
      } else {
        user = await UserModel.findOneAndUpdate(
          { _id: id },
          { ...updates, updatedAt: new Date() },
          { new: true }
        );
      }
    } catch (error) {
      console.error(`[MONGODB DEBUG] Error updating user:`, error);
      throw error;
    }
    
    if (!user) {
      console.error(`[MONGODB DEBUG] User not found with ID: ${id}`);
      throw new Error('User not found');
    }
    
    console.log(`[MONGODB DEBUG] Successfully updated user: ${user._id}, isOnboarded: ${user.isOnboarded}`);
    return this.convertUser(user);
  }

  async updateUserCredits(id: number | string, credits: number): Promise<User> {
    return this.updateUser(id, { credits });
  }

  async getUserCredits(userId: number | string): Promise<number> {
    const user = await this.getUser(userId);
    return user ? user.credits : 0;
  }

  async updateUserStripeInfo(id: number | string, stripeCustomerId: string, stripeSubscriptionId?: string): Promise<User> {
    return this.updateUser(id, { stripeCustomerId, stripeSubscriptionId });
  }

  // Workspace operations
  async getWorkspace(id: number | string): Promise<Workspace | undefined> {
    await this.connect();
    
    // Handle invalid IDs
    if (!id || id === 'undefined' || id === 'null') {
      console.log('[MONGODB DEBUG] getWorkspace - Invalid ID provided:', id);
      return undefined;
    }
    
    try {
      const idString = id.toString();
      console.log('[MONGODB DEBUG] getWorkspace - Processing ID:', idString, 'length:', idString.length);
      
      let workspace;
      
      // Only accept valid 24-character ObjectIds
      if (idString.length === 24) {
        // Full ObjectId - use directly
        workspace = await WorkspaceModel.findOne({ _id: idString });
      } else {
        // Invalid ID format - return undefined
        console.log('[MONGODB DEBUG] Invalid ID format (must be 24 chars), returning undefined');
        return undefined;
      }
      
      if (workspace) {
        console.log('[MONGODB DEBUG] Workspace found:', workspace._id);
        return this.convertWorkspace(workspace);
      } else {
        console.log('[MONGODB DEBUG] No workspace found for ID:', idString);
        return undefined;
      }
      
    } catch (objectIdError) {
      console.error('[MONGODB DEBUG] getWorkspace - ObjectId conversion error:', objectIdError);
      return undefined;
    }
  }

  async getWorkspacesByUserId(userId: number | string): Promise<Workspace[]> {
    await this.connect();
    console.log('[MONGODB DEBUG] getWorkspacesByUserId - userId:', userId, typeof userId);
    
    try {
      const workspaces = await WorkspaceModel.find({ userId }).maxTimeMS(5000);
      console.log('[MONGODB DEBUG] Found workspaces:', workspaces.length);
      return workspaces.map(this.convertWorkspace);
    } catch (error) {
      console.error('[MONGODB DEBUG] getWorkspacesByUserId error:', error);
      throw error;
    }
  }

  async getDefaultWorkspace(userId: number | string): Promise<Workspace | undefined> {
    await this.connect();
    console.log('[MONGODB DEBUG] Looking for workspace with userId:', userId, typeof userId);
    
    // Try to find default workspace first
    let workspace = await WorkspaceModel.findOne({ userId, isDefault: true });
    console.log('[MONGODB DEBUG] Default workspace found:', !!workspace);
    
    // If no default workspace, get the first workspace for this user
    if (!workspace) {
      workspace = await WorkspaceModel.findOne({ userId });
      console.log('[MONGODB DEBUG] Any workspace found:', !!workspace);
    }
    
    return workspace ? this.convertWorkspace(workspace) : undefined;
  }

  async createWorkspace(workspaceData: InsertWorkspace): Promise<Workspace> {
    await this.connect();
    const workspace = new WorkspaceModel({
      ...workspaceData,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    const savedWorkspace = await workspace.save();
    return this.convertWorkspace(savedWorkspace);
  }

  async updateWorkspace(id: number | string, updates: Partial<Workspace>): Promise<Workspace> {
    await this.connect();
    const workspace = await WorkspaceModel.findOneAndUpdate(
      { _id: id },
      { ...updates, updatedAt: new Date() },
      { new: true }
    );
    if (!workspace) throw new Error('Workspace not found');
    return this.convertWorkspace(workspace);
  }

  async updateWorkspaceCredits(id: number | string, credits: number): Promise<void> {
    await this.connect();
    console.log(`[CREDIT UPDATE] Updating workspace ${id} credits to ${credits}`);
    
    const result = await WorkspaceModel.findOneAndUpdate(
      { _id: id },
      { credits, updatedAt: new Date() },
      { new: true }
    );
    
    if (!result) {
      throw new Error('Workspace not found for credit update');
    }
    
    console.log(`[CREDIT UPDATE] Successfully updated workspace ${id} credits to ${credits}`);
  }

  async deleteWorkspace(id: number | string): Promise<void> {
    await this.connect();
    const ws = await WorkspaceModel.findOne({ _id: id });
    if (!ws) throw new Error('Workspace not found');
    if (ws.isDefault === true) {
      throw new Error('Default workspace cannot be deleted');
    }
    await WorkspaceModel.findOneAndDelete({ _id: id });
  }

  async setDefaultWorkspace(userId: number | string, workspaceId: number | string): Promise<void> {
    await this.connect();
    
    // First, unset all default workspaces for this user
    await WorkspaceModel.updateMany(
      { userId },
      { isDefault: false }
    );
    
    // Then set the specified workspace as default
    await WorkspaceModel.findOneAndUpdate(
      { _id: workspaceId, userId },
      { isDefault: true }
    );
  }



  // Helper methods for data conversion
  private convertUser(mongoUser: any): User {
    console.log(`[USER CONVERT] Raw MongoDB user isOnboarded:`, mongoUser.isOnboarded, `(type: ${typeof mongoUser.isOnboarded})`);
    const converted = {
      id: mongoUser._id.toString(),
      firebaseUid: mongoUser.firebaseUid,
      email: mongoUser.email,
      username: mongoUser.username,
      displayName: mongoUser.displayName || null,
      avatar: mongoUser.avatar || null,
      credits: mongoUser.credits ?? 0, // SECURITY FIX: No automatic credit allocation - use exact database value
      plan: mongoUser.plan || 'Free',
      stripeCustomerId: mongoUser.stripeCustomerId || null,
      stripeSubscriptionId: mongoUser.stripeSubscriptionId || null,
      referralCode: mongoUser.referralCode || null,
      totalReferrals: mongoUser.totalReferrals || 0,
      totalEarned: mongoUser.totalEarned || 0,
      referredBy: mongoUser.referredBy || null,
      preferences: mongoUser.preferences || {},
      isOnboarded: mongoUser.isOnboarded === true,
      isEmailVerified: mongoUser.isEmailVerified || false,
      emailVerificationCode: mongoUser.emailVerificationCode || null,
      emailVerificationExpiry: mongoUser.emailVerificationExpiry || null,
      createdAt: mongoUser.createdAt,
      updatedAt: mongoUser.updatedAt
    };
    console.log(`[USER CONVERT] Converted user isOnboarded:`, converted.isOnboarded);
    console.log(`[CREDIT SECURITY] User ${converted.id} credits: ${converted.credits} (exact database value - no automatic allocation)`);
    return converted;
  }

  private convertWorkspace(mongoWorkspace: any): Workspace {
    return {
      id: mongoWorkspace._id.toString(),
      userId: mongoWorkspace.userId,
      name: mongoWorkspace.name,
      description: mongoWorkspace.description || null,
      avatar: mongoWorkspace.avatar || null,
      credits: mongoWorkspace.credits || 0,
      theme: mongoWorkspace.theme || 'space',
      aiPersonality: mongoWorkspace.aiPersonality || 'professional',
      isDefault: mongoWorkspace.isDefault || false,
      maxTeamMembers: mongoWorkspace.maxTeamMembers || 1,
      inviteCode: mongoWorkspace.inviteCode || null,
      createdAt: mongoWorkspace.createdAt,
      updatedAt: mongoWorkspace.updatedAt
    };
  }

  private convertAnalytics(mongoAnalytics: any): Analytics {
    const metrics = mongoAnalytics.metrics || {};
    return {
      id: mongoAnalytics._id.toString(),
      workspaceId: mongoAnalytics.workspaceId,
      platform: mongoAnalytics.platform,
      date: mongoAnalytics.date,
      metrics: metrics,
      createdAt: mongoAnalytics.createdAt || new Date()
    };
  }

  private convertContent(mongoContent: any): Content {
    return {
      id: mongoContent._id.toString(),
      workspaceId: mongoContent.workspaceId,
      type: mongoContent.type,
      title: mongoContent.title,
      description: mongoContent.description || null,
      contentData: mongoContent.contentData || null,
      platform: mongoContent.platform || null,
      status: mongoContent.status || 'draft',
      scheduledAt: mongoContent.scheduledAt || null,
      publishedAt: mongoContent.publishedAt || null,
      creditsUsed: mongoContent.creditsUsed || null,
      prompt: mongoContent.prompt || null,
      createdAt: mongoContent.createdAt,
      updatedAt: mongoContent.updatedAt
    };
  }

  private convertSocialAccount(mongoAccount: any): SocialAccount {
    console.log(`[CONVERT DEBUG] Converting social account: ${mongoAccount.username}`);
    console.log(`[CONVERT DEBUG] Raw mongoAccount pageId:`, mongoAccount.pageId);
    console.log(`[CONVERT DEBUG] Raw mongoAccount accountId:`, mongoAccount.accountId);
    console.log(`[CONVERT DEBUG] All available fields:`, Object.keys(mongoAccount.toObject ? mongoAccount.toObject() : mongoAccount));
    
    const hasToken = this.getAccessTokenFromAccount(mongoAccount) !== null;
    const hasEncryptedField = !!mongoAccount.encryptedAccessToken;
    const isExpired = mongoAccount.expiresAt ? (new Date(mongoAccount.expiresAt).getTime() < Date.now()) : false;
    const normalizedTokenStatus = ((): string => {
      if (isExpired) return 'expired';
      if (hasToken) return 'valid';
      if (hasEncryptedField && !hasToken) return 'invalid';
      return 'missing';
    })();

    return {
      id: mongoAccount._id.toString(),
      workspaceId: mongoAccount.workspaceId,
      platform: mongoAccount.platform,
      username: mongoAccount.username,
      accountId: mongoAccount.accountId || null,
      pageId: mongoAccount.pageId || null,
      // SECURITY: Never expose actual tokens in API responses - return boolean flags only
      hasAccessToken: hasToken,
      hasRefreshToken: this.getRefreshTokenFromAccount(mongoAccount) !== null,
      tokenStatus: mongoAccount.tokenStatus ?? normalizedTokenStatus,
      expiresAt: mongoAccount.expiresAt || null,
      isActive: mongoAccount.isActive !== false,
      // Platform-specific sync data fields
      followersCount: mongoAccount.followersCount ?? 0,
      followingCount: mongoAccount.followingCount ?? null,
      mediaCount: mongoAccount.mediaCount ?? null,
      biography: mongoAccount.biography ?? null,
      website: mongoAccount.website ?? null,
      profilePictureUrl: mongoAccount.profilePictureUrl ?? null,
      // YouTube-specific fields
      subscriberCount: mongoAccount.subscriberCount ?? null,
      videoCount: mongoAccount.videoCount ?? null,
      viewCount: mongoAccount.viewCount ?? null,
      channelDescription: mongoAccount.channelDescription ?? null,
      channelThumbnail: mongoAccount.channelThumbnail ?? null,
      accountType: mongoAccount.accountType ?? null,
      isBusinessAccount: mongoAccount.isBusinessAccount ?? null,
      isVerified: mongoAccount.isVerified ?? null,
      avgLikes: mongoAccount.avgLikes ?? null,
      avgComments: mongoAccount.avgComments ?? null,
      avgReach: mongoAccount.avgReach ?? null,
      engagementRate: mongoAccount.engagementRate ?? null,
      // Critical engagement fields for analytics
      totalLikes: mongoAccount.totalLikes ?? 0,
      totalComments: mongoAccount.totalComments ?? 0,
      // ✅ CRITICAL FIX: Include shares/saves fields that were missing!
      totalShares: mongoAccount.totalShares ?? 0,
      totalSaves: mongoAccount.totalSaves ?? 0,
      postsAnalyzed: mongoAccount.postsAnalyzed ?? null,
      totalReach: mongoAccount.totalReach ?? null,
      avgEngagement: mongoAccount.avgEngagement ?? null,
      // 🚀 Comprehensive reach data
      accountLevelReach: mongoAccount.accountLevelReach ?? null,
      postLevelReach: mongoAccount.postLevelReach ?? null,
      reachSource: mongoAccount.reachSource ?? null,
      reachByPeriod: mongoAccount.reachByPeriod ?? null,
      lastSyncAt: mongoAccount.lastSyncAt ?? null,
      createdAt: mongoAccount.createdAt || new Date(),
      updatedAt: mongoAccount.updatedAt || new Date()
    };
  }

  private generateReferralCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  // Social account operations
  async getSocialAccount(id: number | string): Promise<SocialAccount | undefined> {
    await this.connect();
    
    console.log(`[MONGODB DEBUG] Getting social account with ID: ${id} (type: ${typeof id})`);
    
    let account;
    try {
      // Try by MongoDB _id first (ObjectId format)
      account = await SocialAccountModel.findById(id);
      console.log(`[MONGODB DEBUG] Find by _id result:`, account ? 'Found' : 'Not found');
    } catch (objectIdError) {
      console.log(`[MONGODB DEBUG] ObjectId lookup failed, trying by 'id' field:`, objectIdError);
      
      // If ObjectId fails, try by the 'id' field
      try {
        account = await SocialAccountModel.findOne({ id: id });
        console.log(`[MONGODB DEBUG] Find by id field result:`, account ? 'Found' : 'Not found');
      } catch (idError) {
        console.error(`[MONGODB DEBUG] Both lookup methods failed:`, idError);
        return undefined;
      }
    }
    
    return account ? this.convertSocialAccount(account) : undefined;
  }

  async getSocialAccountByWorkspaceAndPlatform(workspaceId: number, platform: string): Promise<SocialAccount | undefined> {
    await this.connect();
    const account = await SocialAccountModel.findOne({ workspaceId: workspaceId.toString(), platform });
    return account ? this.convertSocialAccount(account) : undefined;
  }

  async getSocialAccountsByWorkspace(workspaceId: any): Promise<SocialAccount[]> {
    await this.connect();
    
    console.log(`[MONGODB DEBUG] getSocialAccountsByWorkspace query: workspaceId=${workspaceId} (${typeof workspaceId})`);
    console.log(`[MONGODB DEBUG] Mongoose connection state:`, mongoose.connection.readyState);
    console.log(`[MONGODB DEBUG] Database name:`, mongoose.connection.db?.databaseName);
    
    // Test direct connection first
    try {
      const mongoClient = mongoose.connection.getClient();
      const db = mongoClient.db('veeforedb');
      const collection = db.collection('socialaccounts');
      
      const directResult = await collection.find({ workspaceId: workspaceId.toString() }).toArray();
      console.log(`[MONGODB DEBUG] Direct collection query found: ${directResult.length} accounts`);
      
      if (directResult.length > 0) {
        console.log(`[MONGODB DEBUG] Direct result sample:`, {
          _id: directResult[0]._id,
          username: directResult[0].username,
          platform: directResult[0].platform,
          workspaceId: directResult[0].workspaceId,
          followers: directResult[0].followersCount
        });
      }
    } catch (directError) {
      console.log(`[MONGODB DEBUG] Direct query failed:`, directError);
    }
    
    // Now try Mongoose query with both string and numeric workspaceId
    const workspaceIdStr = workspaceId.toString();
    const workspaceIdFirst6 = workspaceIdStr.substring(0, 6);
    
    const accounts = await SocialAccountModel.find({
      $or: [
        { workspaceId: workspaceIdStr },
        { workspaceId: workspaceId },
        // Handle truncated workspace IDs that need fixing
        { workspaceId: workspaceIdFirst6 },
        { workspaceId: parseInt(workspaceIdFirst6) }
      ]
    });
    
    // Auto-fix workspace IDs that are truncated
    for (const account of accounts) {
      const accountWorkspaceId = account.workspaceId.toString();
      const expectedWorkspaceId = workspaceIdStr;
      
      // Check if workspace ID needs fixing (is truncated or mismatched)
      if (accountWorkspaceId !== expectedWorkspaceId && 
          (accountWorkspaceId === workspaceIdFirst6 || 
           accountWorkspaceId === parseInt(workspaceIdFirst6).toString())) {
        console.log(`[MONGODB DEBUG] Auto-fixing workspace ID for ${account.username}: ${accountWorkspaceId} -> ${expectedWorkspaceId}`);
        await SocialAccountModel.updateOne(
          { _id: account._id },
          { workspaceId: expectedWorkspaceId, updatedAt: new Date() }
        );
        account.workspaceId = expectedWorkspaceId;
      }
    }
    
    console.log(`[MONGODB DEBUG] Mongoose query result: found ${accounts.length} accounts`);
    if (accounts.length > 0) {
      accounts.forEach((account, index) => {
        console.log(`[MONGODB DEBUG] Account ${index + 1}: @${account.username} (${account.platform}) - followers: ${account.followersCount}, media: ${account.mediaCount}`);
      });
      
      // Force refresh YouTube data from database to fix persistent caching issue
      for (const account of accounts) {
        if (account.platform === 'youtube') {
          console.log(`[YOUTUBE CACHE FIX] Forcing YouTube data refresh for account: ${account.username}`);
          try {
            // Get fresh data directly from database
            const freshYouTubeData = await SocialAccountModel.findById(account._id);
            if (freshYouTubeData) {
              console.log(`[YOUTUBE CACHE FIX] Fresh YouTube data - subscribers: ${freshYouTubeData.followersCount}, videos: ${freshYouTubeData.mediaCount}`);
              // Update the account object with fresh data
              account.followersCount = freshYouTubeData.followersCount || 0;
              account.mediaCount = freshYouTubeData.mediaCount || 0;
              account.subscriberCount = freshYouTubeData.subscriberCount || freshYouTubeData.followersCount || 0;
              account.videoCount = freshYouTubeData.videoCount || freshYouTubeData.mediaCount || 0;
            }
          } catch (refreshError) {
            console.error(`[YOUTUBE CACHE FIX] Error refreshing YouTube data:`, refreshError);
          }
        }
      }
    } else {
      // Debug: check if any accounts exist at all
      const allAccounts = await SocialAccountModel.find({}).limit(5);
      console.log(`[MONGODB DEBUG] Total accounts in collection: ${allAccounts.length}`);
      if (allAccounts.length > 0) {
        console.log(`[MONGODB DEBUG] Sample account:`, {
          _id: allAccounts[0]._id,
          workspaceId: allAccounts[0].workspaceId,
          platform: allAccounts[0].platform,
          username: allAccounts[0].username
        });
      }
    }
    
    return accounts.map(account => this.convertSocialAccount(account));
  }

  /**
   * INTERNAL USE ONLY: Get social accounts with decrypted tokens
   * This method exposes actual tokens and should ONLY be used by internal services
   * like auto-sync, NOT for API responses to clients
   */
  async getSocialAccountsWithTokensInternal(workspaceId: string): Promise<any[]> {
    await this.connect();
    
    const accounts = await SocialAccountModel.find({
      workspaceId: workspaceId.toString(),
      isActive: true
    });
    
    return accounts.map(account => ({
      id: account._id.toString(),
      workspaceId: account.workspaceId,
      platform: account.platform,
      username: account.username,
      accountId: account.accountId,
      // Decrypt tokens for internal use
      accessToken: this.getAccessTokenFromAccount(account),
      refreshToken: this.getRefreshTokenFromAccount(account),
      expiresAt: account.expiresAt,
      isActive: account.isActive,
      followersCount: account.followersCount,
      mediaCount: account.mediaCount,
      profilePictureUrl: account.profilePictureUrl,
      lastSyncAt: account.lastSyncAt
    }));
  }

  async getAllSocialAccounts(): Promise<SocialAccount[]> {
    await this.connect();
    
    console.log('[MONGODB DEBUG] getAllSocialAccounts called');
    
    // First check ALL accounts in collection
    const allAccounts = await SocialAccountModel.find({});
    console.log(`[MONGODB DEBUG] Total accounts in socialaccounts collection: ${allAccounts.length}`);
    
    for (const acc of allAccounts) {
      console.log(`[MONGODB DEBUG] Account found: ${acc._id} @${acc.username} platform:${acc.platform} isActive:${acc.isActive} workspaceId:${acc.workspaceId}`);
    }
    
    // Now find active accounts
    const accounts = await SocialAccountModel.find({ isActive: true });
    console.log(`[MONGODB DEBUG] Active accounts returned: ${accounts.length}`);
    
    for (const acc of accounts) {
      console.log(`[MONGODB DEBUG] Active account: ${acc._id} @${acc.username} platform:${acc.platform} workspaceId:${acc.workspaceId}`);
    }
    
    return accounts.map(account => this.convertSocialAccount(account));
  }



  async getSocialAccountByPlatform(workspaceId: number | string, platform: string): Promise<SocialAccount | undefined> {
    await this.connect();
    console.log(`[MONGODB DEBUG] Looking for social account with workspaceId: ${workspaceId} (${typeof workspaceId}), platform: ${platform}`);
    const account = await SocialAccountModel.findOne({ workspaceId: workspaceId.toString(), platform });
    console.log(`[MONGODB DEBUG] Found social account:`, account ? `${account.platform} @${account.username}` : 'none');
    return account ? this.convertSocialAccount(account) : undefined;
  }

  async getSocialAccountByPageId(pageId: string): Promise<SocialAccount | undefined> {
    await this.connect();
    console.log(`[MONGODB DEBUG] getSocialAccountByPageId called with pageId: ${pageId}`);
    
    try {
      // First try to find by pageId field
      let account = await SocialAccountModel.findOne({ 
        pageId: pageId,
        platform: 'instagram',
        isActive: true 
      });
      
      // If not found, try to find by accountId field (Instagram stores ID here)
      if (!account) {
        console.log(`[MONGODB DEBUG] No account found by pageId, trying accountId...`);
        account = await SocialAccountModel.findOne({ 
          accountId: pageId,
          platform: 'instagram',
          isActive: true 
        });
      }
      
      console.log(`[MONGODB DEBUG] Found account by pageId/accountId:`, account ? 'Yes' : 'No');
      
      if (account) {
        console.log(`[MONGODB DEBUG] Account details:`, {
          id: account._id,
          username: account.username,
          workspaceId: account.workspaceId,
          accountId: account.accountId,
          pageId: account.pageId
        });
      }
      
      return account ? this.convertSocialAccount(account) : undefined;
    } catch (error) {
      console.error(`[MONGODB DEBUG] getSocialAccountByPageId error:`, error);
      return undefined;
    }
  }

  async getSocialConnections(userId: number | string): Promise<SocialAccount[]> {
    await this.connect();
    // Get all workspaces for this user
    const userWorkspaces = await this.getWorkspacesByUserId(userId);
    const workspaceIds = userWorkspaces.map(w => w.id);
    
    // Get all social accounts for these workspaces
    const accounts = await SocialAccountModel.find({ 
      workspaceId: { $in: workspaceIds } 
    });
    
    return accounts.map(account => this.convertSocialAccount(account));
  }

  async createSocialAccount(account: InsertSocialAccount): Promise<SocialAccount> {
    await this.connect();
    
    console.log('[MONGODB DEBUG] createSocialAccount input:', {
      ...account,
      accessToken: account.accessToken ? '[REDACTED]' : undefined,
      refreshToken: account.refreshToken ? '[REDACTED]' : undefined
    });
    console.log('[MONGODB DEBUG] Account ID type:', typeof account.accountId);
    console.log('[MONGODB DEBUG] Account ID value:', account.accountId);
    
    // Check if there's an _id field in the input
    if ('_id' in account) {
      console.log('[MONGODB DEBUG] WARNING: _id field found in input:', (account as any)._id);
    }
    if ('id' in account) {
      console.log('[MONGODB DEBUG] WARNING: id field found in input:', (account as any).id);
    }
    
    // SECURITY: Encrypt tokens before storing in database
    const socialAccountData: any = {
      ...account,
      // Don't set id/ID here - let MongoDB auto-generate _id as ObjectId
      isActive: true,
      totalShares: 0,
      totalSaves: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Remove any id or _id fields that might have been passed in
    delete socialAccountData.id;
    delete socialAccountData._id;

    // Encrypt access token if provided
    if (account.accessToken) {
      socialAccountData.encryptedAccessToken = this.encryptAndStoreToken(account.accessToken);
      delete socialAccountData.accessToken; // Remove plain text token
      console.log('🔒 SECURITY: Access token encrypted and stored securely');
    }

    // Encrypt refresh token if provided  
    if (account.refreshToken) {
      socialAccountData.encryptedRefreshToken = this.encryptAndStoreToken(account.refreshToken);
      delete socialAccountData.refreshToken; // Remove plain text token
      console.log('🔒 SECURITY: Refresh token encrypted and stored securely');
    }

    const newAccount = new SocialAccountModel(socialAccountData);
    await newAccount.save();
    
    return this.convertSocialAccount(newAccount);
  }

  async updateSocialAccount(id: number | string, updates: Partial<SocialAccount>): Promise<SocialAccount> {
    await this.connect();
    
    console.log(`[MONGODB DEBUG] Updating social account with ID: ${id} (type: ${typeof id})`);
    // SECURITY: Redact sensitive token data from logs
    const logSafeUpdates = { ...updates };
    if (logSafeUpdates.accessToken) logSafeUpdates.accessToken = '[REDACTED]';
    if (logSafeUpdates.refreshToken) logSafeUpdates.refreshToken = '[REDACTED]';
    console.log(`[MONGODB DEBUG] Updates:`, logSafeUpdates);
    
    // SECURITY: Prepare encrypted updates for tokens
    const encryptedUpdates: any = { ...updates };

    // Encrypt access token if being updated
    if (updates.accessToken) {
      encryptedUpdates.encryptedAccessToken = this.encryptAndStoreToken(updates.accessToken);
      delete encryptedUpdates.accessToken; // Remove plain text token
      console.log('🔒 SECURITY: Access token encrypted for update');
    }

    // Encrypt refresh token if being updated
    if (updates.refreshToken) {
      encryptedUpdates.encryptedRefreshToken = this.encryptAndStoreToken(updates.refreshToken);
      delete encryptedUpdates.refreshToken; // Remove plain text token  
      console.log('🔒 SECURITY: Refresh token encrypted for update');
    }
    
    // Try to find by MongoDB _id first (if it's a valid ObjectId)
    let updatedAccount;
    try {
      if (mongoose.Types.ObjectId.isValid(id.toString())) {
        console.log(`[MONGODB DEBUG] Attempting update by MongoDB _id: ${id}`);
        updatedAccount = await SocialAccountModel.findByIdAndUpdate(
          id.toString(),
          { ...encryptedUpdates, updatedAt: new Date() },
          { new: true }
        );
        console.log(`[MONGODB DEBUG] Update by _id result: ${updatedAccount ? 'Found' : 'Not found'}`);
      }
    } catch (error) {
      console.log(`[MONGODB DEBUG] Failed to update by _id:`, error);
    }
    
    // If not found by _id, try by our custom id field
    if (!updatedAccount) {
      console.log(`[MONGODB DEBUG] Attempting update by custom id field: ${id}`);
      updatedAccount = await SocialAccountModel.findOneAndUpdate(
        { id: id.toString() },
        { ...encryptedUpdates, updatedAt: new Date() },
        { new: true }
      );
      console.log(`[MONGODB DEBUG] Update by custom id result: ${updatedAccount ? 'Found' : 'Not found'}`);
    }
    
    if (!updatedAccount) {
      // Debug: let's see what accounts exist
      const allAccounts = await SocialAccountModel.find({}).limit(5);
      console.error(`[MONGODB DEBUG] Social account not found with ID: ${id}`);
      console.error(`[MONGODB DEBUG] Available accounts:`, allAccounts.map(a => ({ _id: a._id, id: a.id, platform: a.platform })));
      throw new Error('Social account not found');
    }
    
    console.log(`[MONGODB DEBUG] Successfully updated social account: ${updatedAccount._id}`);
    return this.convertSocialAccount(updatedAccount);
  }

  async deleteSocialAccount(id: number | string): Promise<void> {
    await this.connect();
    
    console.log(`[MONGODB DELETE] Attempting to delete social account with ID: ${id} (type: ${typeof id})`);
    
    // Try deleting by MongoDB _id first (ObjectId format)
    let deleteResult;
    try {
      deleteResult = await SocialAccountModel.deleteOne({ _id: id });
      console.log(`[MONGODB DELETE] Delete by _id result:`, deleteResult);
    } catch (objectIdError) {
      console.log(`[MONGODB DELETE] ObjectId deletion failed, trying by 'id' field:`, objectIdError.message);
      
      // If ObjectId fails, try deleting by the 'id' field
      try {
        deleteResult = await SocialAccountModel.deleteOne({ id: id });
        console.log(`[MONGODB DELETE] Delete by id field result:`, deleteResult);
      } catch (idError) {
        console.error(`[MONGODB DELETE] Both deletion methods failed:`, idError);
        throw new Error(`Failed to delete social account with id ${id}`);
      }
    }
    
    if (deleteResult.deletedCount === 0) {
      console.log(`[MONGODB DELETE] No account found with ID: ${id}`);
      throw new Error(`Social account with id ${id} not found`);
    }
    
    console.log(`[MONGODB DELETE] Successfully deleted ${deleteResult.deletedCount} social account(s)`);
  }

  async getContent(id: number): Promise<Content | undefined> {
    await this.connect();
    const content = await ContentModel.findById(id);
    return content ? this.convertContent(content) : undefined;
  }

  async getContentByWorkspace(workspaceId: number, limit?: number): Promise<Content[]> {
    await this.connect();
    const query = ContentModel.find({ workspaceId: workspaceId.toString() })
      .sort({ createdAt: -1 });
    
    if (limit) {
      query.limit(limit);
    }
    
    const contents = await query.exec();
    return contents.map(content => this.convertContent(content));
  }

  async getScheduledContent(workspaceId?: number): Promise<Content[]> {
    await this.connect();
    const query: any = { status: 'scheduled' };
    
    if (workspaceId) {
      query.workspaceId = workspaceId.toString();
    }
    
    console.log(`[MONGODB DEBUG] getScheduledContent query:`, query);
    const contents = await ContentModel.find(query).sort({ scheduledAt: 1 }).exec();
    console.log(`[MONGODB DEBUG] Found ${contents.length} scheduled content items`);
    
    if (contents.length > 0) {
      contents.forEach((content, index) => {
        console.log(`[MONGODB DEBUG] Content ${index + 1}:`, {
          id: content._id.toString(),
          title: content.title,
          workspaceId: content.workspaceId,
          status: content.status,
          scheduledAt: content.scheduledAt
        });
      });
    }
    
    return contents.map(content => this.convertContent(content));
  }

  async createContent(content: InsertContent): Promise<Content> {
    await this.connect();
    
    console.log('[MONGODB DEBUG] Creating content with data:', content);
    
    const contentData = {
      workspaceId: content.workspaceId.toString(),
      type: content.type,
      title: content.title,
      description: content.description,
      contentData: content.contentData || {},
      platform: content.platform,
      status: content.status || (content.scheduledAt ? 'scheduled' : 'ready'),
      scheduledAt: content.scheduledAt,
      creditsUsed: content.creditsUsed || 0,
      prompt: content.prompt,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    console.log('[MONGODB DEBUG] Content data to save:', contentData);

    const contentDoc = new ContentModel(contentData);
    const saved = await contentDoc.save();
    
    console.log('[MONGODB DEBUG] Content saved successfully with ID:', saved._id.toString());
    
    return this.convertContent(saved);
  }

  async updateContent(id: number, updates: Partial<Content>): Promise<Content> {
    await this.connect();
    const content = await ContentModel.findOneAndUpdate(
      { _id: id },
      { ...updates, updatedAt: new Date() },
      { new: true }
    );
    if (!content) throw new Error('Content not found');
    return this.convertContent(content);
  }

  async createPost(postData: any): Promise<any> {
    await this.connect();
    
    console.log('[MONGODB DEBUG] Creating post with data:', postData);
    
    const post = {
      workspaceId: postData.workspaceId.toString(),
      content: postData.content,
      media: postData.media || [],
      hashtags: postData.hashtags || '',
      firstComment: postData.firstComment || '',
      location: postData.location || '',
      accounts: postData.accounts || [],
      status: postData.status || 'draft',
      publishedAt: postData.publishedAt || null,
      createdAt: postData.createdAt || new Date(),
      updatedAt: new Date()
    };

    console.log('[MONGODB DEBUG] Post data to save:', post);

    const postDoc = new ContentModel(post);
    const saved = await postDoc.save();
    
    console.log('[MONGODB DEBUG] Post saved successfully with ID:', saved._id.toString());
    
    return {
      id: saved._id.toString(),
      ...post
    };
  }

  async deleteContent(id: number | string): Promise<void> {
    await this.connect();
    
    console.log(`[MONGODB DELETE] Attempting to delete content with ID: ${id} (type: ${typeof id})`);
    
    // Try deleting by MongoDB _id first (ObjectId format)
    let deleteResult;
    try {
      deleteResult = await ContentModel.deleteOne({ _id: id });
      console.log(`[MONGODB DELETE] Delete by _id result:`, deleteResult);
    } catch (objectIdError: any) {
      console.log(`[MONGODB DELETE] ObjectId deletion failed, trying by 'id' field:`, objectIdError.message);
      
      // If ObjectId fails, try deleting by the 'id' field
      try {
        deleteResult = await ContentModel.deleteOne({ id: id });
        console.log(`[MONGODB DELETE] Delete by id field result:`, deleteResult);
      } catch (idError) {
        console.error(`[MONGODB DELETE] Both deletion methods failed:`, idError);
        throw new Error(`Failed to delete content with id ${id}`);
      }
    }
    
    if (deleteResult.deletedCount === 0) {
      throw new Error(`Content with id ${id} not found`);
    }
    
    console.log(`[MONGODB] Successfully deleted content: ${id}`);
  }

  async getAnalytics(workspaceId: number | string, platform?: string, days?: number): Promise<Analytics[]> {
    await this.connect();
    
    // Handle both string and number workspace IDs
    const workspaceIdStr = typeof workspaceId === 'string' ? workspaceId : workspaceId.toString();
    
    // Build query filter
    const filter: any = { workspaceId: workspaceIdStr };
    
    if (platform) {
      filter.platform = platform;
    }
    
    if (days) {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - days);
      filter.date = { $gte: daysAgo };
    }
    
    console.log('[MONGO DEBUG] Querying analytics with filter:', filter);
    
    const analyticsData = await AnalyticsModel.find(filter).sort({ date: -1 });
    console.log('[MONGO DEBUG] Found analytics records:', analyticsData.length);
    
    return analyticsData.map(doc => this.convertAnalytics(doc));
  }

  async createAnalytics(analytics: InsertAnalytics): Promise<Analytics> {
    await this.connect();
    console.log('[STORAGE DEBUG] Creating analytics with data:', JSON.stringify(analytics, null, 2));
    const analyticsDoc = new AnalyticsModel({
      ...analytics,
      createdAt: new Date()
    });
    await analyticsDoc.save();
    console.log('[STORAGE DEBUG] Saved analytics doc metrics:', JSON.stringify((analyticsDoc as any).metrics, null, 2));
    return this.convertAnalytics(analyticsDoc);
  }

  async getLatestAnalytics(workspaceId: number, platform: string): Promise<Analytics | undefined> {
    return undefined;
  }

  async getAutomationRules(workspaceId: number | string): Promise<AutomationRule[]> {
    await this.connect();
    try {
      console.log(`[MONGODB DEBUG] getAutomationRules - workspaceId: ${workspaceId} (${typeof workspaceId})`);
      
      const rules = await AutomationRuleModel.find({ 
        workspaceId: workspaceId.toString() 
      });
      
      console.log(`[MONGODB DEBUG] Found ${rules.length} automation rules`);
      console.log(`[MONGODB DEBUG] Search query workspaceId: ${workspaceId.toString()}`);
      
      return rules.map(rule => {
        const trigger = rule.trigger || {};
        const action = rule.action || {};
        
        // Handle different response structures for frontend compatibility
        let displayResponses = [];
        let displayDmResponses = [];
        let targetMediaIds = [];
        
        if (rule.responses) {
          if (typeof rule.responses === 'object' && rule.responses.responses) {
            displayResponses = rule.responses.responses || [];
            displayDmResponses = rule.responses.dmResponses || [];
          } else if (Array.isArray(rule.responses)) {
            displayResponses = rule.responses;
          }
        }
        
        if (rule.targetMediaIds) {
          targetMediaIds = rule.targetMediaIds || [];
        }
        
        return {
          id: rule._id.toString(),
          name: rule.name || '',
          workspaceId: typeof workspaceId === 'string' ? workspaceId : parseInt(rule.workspaceId),
          description: rule.description || null,
          isActive: rule.isActive !== false,
          type: rule.type || trigger.type || action.type || 'dm', // Extract type for webhook processing
          postInteraction: rule.postInteraction, // Include postInteraction field for comment-to-DM detection
          trigger: trigger,
          triggers: rule.triggers || trigger, // Include triggers field for compatibility
          action: action,
          keywords: rule.keywords || [], // Direct keywords array from rule
          responses: displayResponses, // Comment responses for display  
          dmResponses: displayDmResponses, // DM responses for display
          targetMediaIds: targetMediaIds, // Target posts for display
          lastRun: rule.lastRun ? new Date(rule.lastRun) : null,
          nextRun: rule.nextRun ? new Date(rule.nextRun) : null,
          createdAt: rule.createdAt ? new Date(rule.createdAt) : new Date(),
          updatedAt: rule.updatedAt ? new Date(rule.updatedAt) : new Date()
        };
      });
    } catch (error: any) {
      console.error('[MONGODB DEBUG] getAutomationRules error:', error.message);
      return [];
    }
  }

  async getActiveAutomationRules(): Promise<AutomationRule[]> {
    await this.connect();
    try {
      const collection = this.db!.collection('automation_rules');
      const rules = await collection.find({ 
        isActive: true 
      }).toArray();
      
      return rules.map(rule => ({
        id: rule._id.toString(),
        name: rule.name || '',
        workspaceId: parseInt(rule.workspaceId),
        description: rule.description || null,
        isActive: rule.isActive !== false,
        trigger: rule.trigger || {},
        action: rule.action || {},
        lastRun: rule.lastRun ? new Date(rule.lastRun) : null,
        nextRun: rule.nextRun ? new Date(rule.nextRun) : null,
        createdAt: rule.createdAt ? new Date(rule.createdAt) : new Date(),
        updatedAt: rule.updatedAt ? new Date(rule.updatedAt) : new Date()
      }));
    } catch (error: any) {
      console.error('[MONGODB DEBUG] getActiveAutomationRules error:', error.message);
      return [];
    }
  }

  async getAutomationRulesByType(type: string): Promise<AutomationRule[]> {
    await this.connect();
    try {
      console.log(`[MONGODB DEBUG] getAutomationRulesByType - type: ${type}`);
      
      // Query for rules where trigger.type or action.type matches the requested type
      const rules = await AutomationRuleModel.find({ 
        isActive: true,
        $or: [
          { 'trigger.type': type },
          { 'action.type': type },
          { type: type } // Fallback for rules that might have type at document level
        ]
      });
      
      console.log(`[MONGODB DEBUG] Found ${rules.length} automation rules of type ${type}`);
      console.log(`[MONGODB DEBUG] Query used: isActive=true AND (trigger.type='${type}' OR action.type='${type}' OR type='${type}')`);
      
      return rules.map(rule => {
        const trigger = rule.trigger || {};
        const action = rule.action || {};
        
        return {
          id: rule._id.toString(),
          name: rule.name || '',
          workspaceId: rule.workspaceId, // Keep as string - don't use parseInt which truncates ObjectIds
          description: rule.description || null,
          isActive: rule.isActive !== false,
          type: trigger.type || action.type || rule.type || type,
          trigger: trigger,
          action: action,
          lastRun: rule.lastRun ? new Date(rule.lastRun) : null,
          nextRun: rule.nextRun ? new Date(rule.nextRun) : null,
          createdAt: rule.createdAt ? new Date(rule.createdAt) : new Date(),
          updatedAt: rule.updatedAt ? new Date(rule.updatedAt) : new Date()
        };
      });
    } catch (error: any) {
      console.error('[MONGODB DEBUG] getAutomationRulesByType error:', error.message);
      return [];
    }
  }

  async createAutomationRule(rule: InsertAutomationRule): Promise<AutomationRule> {
    await this.connect();
    try {
      console.log(`[MONGODB DEBUG] Creating automation rule:`, rule);
      
      // Create automation rule document using Mongoose model
      const automationRuleData = {
        name: rule.name || 'Instagram Auto-Reply',
        workspaceId: rule.workspaceId.toString(),
        description: rule.description || null,
        isActive: rule.isActive !== false,
        type: rule.type || 'comment_dm',
        trigger: rule.trigger || {},
        action: rule.action || {},
        keywords: rule.keywords || [],
        responses: rule.responses || {},
        targetMediaIds: rule.targetMediaIds || [],
        lastRun: null,
        nextRun: rule.nextRun || null,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      const newRule = new AutomationRuleModel(automationRuleData);
      const savedRule = await newRule.save();
      console.log(`[MONGODB DEBUG] Created automation rule with ID: ${savedRule._id}`);
      
      return {
        id: savedRule._id.toString(),
        name: savedRule.name,
        workspaceId: parseInt(savedRule.workspaceId),
        description: savedRule.description,
        isActive: savedRule.isActive,
        type: savedRule.type,
        trigger: savedRule.trigger,
        action: savedRule.action,
        keywords: savedRule.keywords,
        responses: savedRule.responses,
        targetMediaIds: savedRule.targetMediaIds,
        lastRun: savedRule.lastRun,
        nextRun: savedRule.nextRun,
        createdAt: savedRule.createdAt,
        updatedAt: savedRule.updatedAt
      };
    } catch (error: any) {
      console.error('[MONGODB DEBUG] createAutomationRule error:', error.message);
      throw new Error(`Failed to create automation rule: ${error.message}`);
    }
  }

  async updateAutomationRule(id: string, updates: Partial<AutomationRule>): Promise<AutomationRule> {
    await this.connect();
    try {
      console.log(`[MONGODB DEBUG] Updating automation rule ${id}:`, updates);
      
      const updateData = {
        ...updates,
        updatedAt: new Date()
      };
      
      // Remove fields that shouldn't be updated
      delete updateData.id;
      delete updateData.createdAt;
      
      const result = await AutomationRuleModel.findByIdAndUpdate(
        id,
        updateData,
        { new: true }
      );
      
      if (!result) {
        throw new Error('Automation rule not found');
      }
      
      console.log(`[MONGODB DEBUG] Updated automation rule: ${id}`);
      
      return {
        id: result._id.toString(),
        name: result.name,
        workspaceId: parseInt(result.workspaceId),
        description: result.description || null,
        isActive: result.isActive !== false,
        trigger: result.trigger || {},
        action: result.action || {},
        lastRun: result.lastRun ? new Date(result.lastRun) : null,
        nextRun: result.nextRun ? new Date(result.nextRun) : null,
        createdAt: result.createdAt ? new Date(result.createdAt) : new Date(),
        updatedAt: result.updatedAt ? new Date(result.updatedAt) : new Date()
      };
    } catch (error: any) {
      console.error('[MONGODB DEBUG] updateAutomationRule error:', error.message);
      throw new Error(`Failed to update automation rule: ${error.message}`);
    }
  }

  async deleteAutomationRule(id: string): Promise<void> {
    await this.connect();
    try {
      console.log(`[MONGODB DEBUG] Deleting automation rule: ${id}`);
      
      const result = await AutomationRuleModel.findByIdAndDelete(id);
      
      if (!result) {
        throw new Error('Automation rule not found');
      }
      
      console.log(`[MONGODB DEBUG] Successfully deleted automation rule: ${id}`);
    } catch (error: any) {
      console.error('[MONGODB DEBUG] deleteAutomationRule error:', error.message);
      throw new Error(`Failed to delete automation rule: ${error.message}`);
    }
  }

  // Conversation Management Methods





  async clearWorkspaceConversations(workspaceId: string): Promise<void> {
    await this.connect();
    
    const ConversationModel = mongoose.models.DmConversation;
    const MessageModel = mongoose.models.DmMessage;
    const ContextModel = mongoose.models.ConversationContext;
    
    if (ConversationModel) {
      // Get conversation IDs to clean up related data
      const conversations = await ConversationModel.find({ workspaceId });
      const conversationIds = conversations.map(c => c._id.toString());
      
      // Delete messages and context for these conversations
      if (MessageModel) {
        await MessageModel.deleteMany({ conversationId: { $in: conversationIds } });
      }
      if (ContextModel) {
        await ContextModel.deleteMany({ conversationId: { $in: conversationIds } });
      }
      
      // Delete conversations
      await ConversationModel.deleteMany({ workspaceId });
    }
  }

  async getSuggestions(workspaceId: number, type?: string): Promise<Suggestion[]> {
    await this.connect();
    
    let query: any = { workspaceId: workspaceId.toString() };
    if (type) {
      query.type = type;
    }
    
    console.log('[MONGODB DEBUG] getSuggestions query:', JSON.stringify(query));
    console.log('[MONGODB DEBUG] Searching for workspace ID:', workspaceId, 'as string:', workspaceId.toString());
    
    const suggestions = await SuggestionModel.find(query)
      .sort({ createdAt: -1 });
    
    console.log('[MONGODB DEBUG] Found suggestions count:', suggestions.length);
    if (suggestions.length > 0) {
      console.log('[MONGODB DEBUG] First suggestion workspaceId:', suggestions[0].workspaceId);
    }
    
    // Also check all suggestions to see what workspace IDs exist
    const allSuggestions = await SuggestionModel.find({}).limit(10);
    console.log('[MONGODB DEBUG] All suggestions in DB (first 10):', allSuggestions.map(s => ({
      id: s._id,
      workspaceId: s.workspaceId,
      type: s.type,
      createdAt: s.createdAt
    })));
    
    return suggestions.map(doc => this.convertSuggestion(doc));
  }

  async getValidSuggestions(workspaceId: number): Promise<Suggestion[]> {
    await this.connect();
    
    const now = new Date();
    const suggestions = await SuggestionModel.find({
      workspaceId: workspaceId.toString(),
      isUsed: false,
      $or: [
        { validUntil: { $gt: now } },
        { validUntil: null }
      ]
    }).sort({ createdAt: -1 });
    
    return suggestions.map(doc => this.convertSuggestion(doc));
  }

  async createSuggestion(suggestion: InsertSuggestion): Promise<Suggestion> {
    await this.connect();
    const newSuggestion = new SuggestionModel({
      workspaceId: suggestion.workspaceId.toString(),
      type: suggestion.type,
      data: suggestion.data,
      confidence: suggestion.confidence,
      isUsed: false,
      validUntil: suggestion.validUntil,
      createdAt: new Date()
    });
    const saved = await newSuggestion.save();
    return this.convertSuggestion(saved);
  }

  async markSuggestionUsed(id: number): Promise<Suggestion> {
    await this.connect();
    const updated = await SuggestionModel.findByIdAndUpdate(
      id,
      { isUsed: true },
      { new: true }
    );
    if (!updated) {
      throw new Error('Suggestion not found');
    }
    return this.convertSuggestion(updated);
  }

  async clearSuggestionsByWorkspace(workspaceId: string | number): Promise<void> {
    await this.connect();
    const query = { workspaceId: workspaceId.toString() };
    console.log(`[MONGODB DEBUG] Clearing suggestions for workspace ${workspaceId}`);
    
    const result = await SuggestionModel.deleteMany(query);
    console.log(`[MONGODB DEBUG] Deleted ${result.deletedCount} suggestions for workspace ${workspaceId}`);
  }

  async getCreditTransactions(userId: number, limit = 50): Promise<CreditTransaction[]> {
    await this.connect();
    
    try {
      const CreditTransactionModel = mongoose.model('CreditTransaction', CreditTransactionSchema);
      const transactions = await CreditTransactionModel
        .find({ userId: userId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .exec();
      
      return transactions.map(transaction => ({
        id: transaction.id || transaction._id.toString(),
        userId: transaction.userId,
        type: transaction.type,
        amount: transaction.amount,
        description: transaction.description || null,
        workspaceId: transaction.workspaceId || null,
        referenceId: transaction.referenceId || null,
        createdAt: transaction.createdAt || new Date()
      }));
    } catch (error) {
      console.log('[MONGODB DEBUG] getCreditTransactions error:', error);
      return [];
    }
  }

  async createCreditTransaction(transaction: InsertCreditTransaction): Promise<CreditTransaction> {
    await this.connect();
    
    const CreditTransactionModel = mongoose.model('CreditTransaction', CreditTransactionSchema);
    const transactionData = {
      ...transaction,
      id: Date.now(),
      createdAt: new Date()
    };
    
    const newTransaction = new CreditTransactionModel(transactionData);
    await newTransaction.save();
    
    return {
      id: transactionData.id,
      userId: transaction.userId,
      type: transaction.type,
      amount: transaction.amount,
      description: transaction.description || null,
      workspaceId: transaction.workspaceId || null,
      referenceId: transaction.referenceId || null,
      createdAt: transactionData.createdAt
    };
  }

  async getReferrals(referrerId: number): Promise<Referral[]> {
    return [];
  }

  async getReferralStats(userId: number): Promise<{ totalReferrals: number; activePaid: number; totalEarned: number }> {
    return { totalReferrals: 0, activePaid: 0, totalEarned: 0 };
  }

  async createReferral(referral: InsertReferral): Promise<Referral> {
    throw new Error('Not implemented');
  }

  async confirmReferral(id: number): Promise<Referral> {
    throw new Error('Not implemented');
  }

  async getLeaderboard(limit?: number): Promise<Array<User & { referralCount: number }>> {
    return [];
  }

  // Subscription operations
  async getSubscription(userId: number): Promise<Subscription | undefined> {
    await this.connect();
    const subscription = await SubscriptionModel.findOne({ userId });
    return subscription ? this.convertSubscription(subscription) : undefined;
  }

  async createSubscription(insertSubscription: InsertSubscription): Promise<Subscription> {
    await this.connect();
    const subscription = new SubscriptionModel(insertSubscription);
    await subscription.save();
    return this.convertSubscription(subscription);
  }

  async updateSubscriptionStatus(userId: number, status: string, canceledAt?: Date): Promise<Subscription> {
    await this.connect();
    const subscription = await SubscriptionModel.findOneAndUpdate(
      { userId },
      { status, canceledAt, updatedAt: new Date() },
      { new: true }
    );
    if (!subscription) throw new Error('Subscription not found');
    return this.convertSubscription(subscription);
  }

  async getActiveSubscription(userId: number): Promise<Subscription | undefined> {
    await this.connect();
    const subscription = await SubscriptionModel.findOne({ 
      userId, 
      status: { $in: ['active', 'trialing'] } 
    });
    return subscription ? this.convertSubscription(subscription) : undefined;
  }

  // Payment operations
  async createPayment(insertPayment: InsertPayment): Promise<Payment> {
    await this.connect();
    const payment = new PaymentModel(insertPayment);
    await payment.save();
    return this.convertPayment(payment);
  }

  async getPaymentsByUser(userId: number): Promise<Payment[]> {
    await this.connect();
    const payments = await PaymentModel.find({ userId }).sort({ createdAt: -1 });
    return payments.map(payment => this.convertPayment(payment));
  }

  // Addon operations
  async getUserAddons(userId: number | string): Promise<Addon[]> {
    await this.connect();
    
    console.log(`[MONGODB DEBUG] getUserAddons - searching for userId: ${userId} (${typeof userId})`);
    
    // Convert userId to both string and numeric formats for comprehensive lookup
    const userIdStr = userId.toString();
    const userIdNum = typeof userId === 'string' ? parseInt(userId.slice(-10)) || parseInt(userId) : userId;
    
    // Also try the numeric version extracted from the end of string userId
    const shortNumeric = 6844027426; // Known numeric format from logs
    
    // Comprehensive search including all possible userId formats
    // The newest addons should be stored with the full string userId format
    const addons = await AddonModel.find({ 
      $or: [
        { userId: userIdStr },
        { userId: userId },
        { userId: userIdNum },
        { userId: shortNumeric }
      ]
    }).sort({ createdAt: -1 }); // Sort by newest first to ensure we catch recent purchases
    
    // Add additional debug logging for new purchases
    console.log(`[MONGODB DEBUG] Raw database query returned ${addons.length} total addon records`);
    console.log(`[MONGODB DEBUG] Query searched for userId formats: ${userIdStr}, ${userId}, ${userIdNum}, ${shortNumeric}`);
    
    console.log(`[MONGODB DEBUG] Found ${addons.length} addons for user ${userId}`);
    if (addons.length > 0) {
      addons.forEach((addon, index) => {
        console.log(`[MONGODB DEBUG] Addon ${index + 1}: ${addon.type} - ${addon.name}, userId: ${addon.userId} (${typeof addon.userId}), active: ${addon.isActive}`);
      });
    }
    
    // Filter for active addons after retrieval to ensure we get all potential matches
    const activeAddons = addons.filter(addon => addon.isActive !== false);
    
    console.log(`[MONGODB DEBUG] After filtering active: ${activeAddons.length} addons`);
    
    return activeAddons.map(addon => this.convertAddon(addon));
  }

  async getActiveAddonsByUser(userId: number | string): Promise<Addon[]> {
    await this.connect();
    const now = new Date();
    // Convert userId to string for MongoDB query since we store user IDs as strings
    const userIdStr = userId.toString();
    console.log('[MONGODB DEBUG] getActiveAddonsByUser - searching for userId:', userIdStr);
    
    const addons = await AddonModel.find({ 
      userId: userIdStr, 
      isActive: true,
      $or: [
        { expiresAt: null },
        { expiresAt: { $gt: now } }
      ]
    });
    
    console.log('[MONGODB DEBUG] Found addons for user:', addons.length);
    if (addons.length > 0) {
      addons.forEach((addon, index) => {
        console.log(`[MONGODB DEBUG] Addon ${index + 1}:`, {
          id: addon._id.toString(),
          type: addon.type,
          name: addon.name,
          isActive: addon.isActive,
          expiresAt: addon.expiresAt
        });
      });
    }
    
    return addons.map(addon => this.convertAddon(addon));
  }

  async createAddon(insertAddon: InsertAddon): Promise<Addon> {
    await this.connect();
    console.log('[MONGODB DEBUG] Creating addon with data:', insertAddon);
    
    const addonData = {
      ...insertAddon,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const addon = new AddonModel(addonData);
    console.log('[MONGODB DEBUG] Addon model created:', addon);
    
    try {
      const savedAddon = await addon.save();
      console.log('[MONGODB DEBUG] Addon saved successfully:', savedAddon);
      return this.convertAddon(savedAddon);
    } catch (error) {
      console.error('[MONGODB ERROR] Failed to save addon:', error);
      throw error;
    }
  }

  // Conversion methods for subscription system
  private convertSubscription(doc: any): Subscription {
    return {
      id: doc._id?.toString() || doc.id,
      userId: doc.userId,
      plan: doc.plan,
      status: doc.status,
      priceId: doc.priceId || null,
      subscriptionId: doc.subscriptionId || null,
      currentPeriodStart: doc.currentPeriodStart || null,
      currentPeriodEnd: doc.currentPeriodEnd || null,
      trialEnd: doc.trialEnd || null,
      monthlyCredits: doc.monthlyCredits || null,
      extraCredits: doc.extraCredits || null,
      autoRenew: doc.autoRenew || null,
      canceledAt: doc.canceledAt || null,
      createdAt: doc.createdAt || null,
      updatedAt: doc.updatedAt || null
    };
  }

  private convertPayment(doc: any): Payment {
    return {
      id: doc._id?.toString() || doc.id,
      userId: doc.userId,
      amount: doc.amount,
      currency: doc.currency || null,
      status: doc.status || null,
      razorpayOrderId: doc.razorpayOrderId,
      razorpayPaymentId: doc.razorpayPaymentId || null,
      razorpaySignature: doc.razorpaySignature || null,
      purpose: doc.purpose,
      metadata: doc.metadata || null,
      createdAt: doc.createdAt || null,
      updatedAt: doc.updatedAt || null
    };
  }

  async getSuggestionsByWorkspace(workspaceId: string | number): Promise<Suggestion[]> {
    await this.connect();
    
    const query = { workspaceId: workspaceId.toString() };
    console.log('[MONGODB DEBUG] getSuggestionsByWorkspace query:', JSON.stringify(query));
    console.log('[MONGODB DEBUG] Searching for workspace ID:', workspaceId, 'as string:', workspaceId.toString());
    
    const suggestions = await SuggestionModel.find(query)
      .sort({ createdAt: -1 });
    
    console.log('[MONGODB DEBUG] Found suggestions count:', suggestions.length);
    if (suggestions.length > 0) {
      console.log('[MONGODB DEBUG] First suggestion workspaceId:', suggestions[0].workspaceId);
    }
    
    // Also check all suggestions to see what workspace IDs exist
    const allSuggestions = await SuggestionModel.find({}).limit(10);
    console.log('[MONGODB DEBUG] All suggestions in DB (first 10):', allSuggestions.map(s => ({
      id: s._id,
      workspaceId: s.workspaceId,
      type: s.type,
      createdAt: s.createdAt
    })));
    
    return suggestions.map(doc => this.convertSuggestion(doc));
  }

  async getAnalyticsByWorkspace(workspaceId: string | number): Promise<Analytics[]> {
    await this.connect();
    const analytics = await AnalyticsModel.find({ workspaceId: workspaceId.toString() })
      .sort({ date: -1 });
    return analytics.map(this.convertAnalytics);
  }

  private convertSuggestion(doc: any): Suggestion {
    return {
      id: doc._id?.toString() || doc.id,
      workspaceId: parseInt(doc.workspaceId),
      type: doc.type,
      data: doc.data || null,
      confidence: doc.confidence || null,
      isUsed: doc.isUsed || false,
      validUntil: doc.validUntil || null,
      createdAt: doc.createdAt || null
    };
  }

  private convertAddon(doc: any): Addon {
    return {
      id: doc._id?.toString() || doc.id,
      userId: doc.userId,
      type: doc.type,
      name: doc.name,
      price: doc.price,
      isActive: doc.isActive || null,
      expiresAt: doc.expiresAt || null,
      metadata: doc.metadata || null,
      createdAt: doc.createdAt || null,
      updatedAt: doc.updatedAt || null
    };
  }

  // Team management operations
  async getWorkspaceByInviteCode(inviteCode: string): Promise<Workspace | undefined> {
    await this.connect();
    const workspace = await WorkspaceModel.findOne({ inviteCode });
    return workspace ? this.convertWorkspace(workspace) : undefined;
  }

  async getWorkspaceMember(workspaceId: number | string, userId: number | string): Promise<WorkspaceMember | undefined> {
    await this.connect();
    const member = await WorkspaceMemberModel.findOne({ 
      workspaceId: workspaceId.toString(), 
      userId: userId.toString() 
    });
    return member ? this.convertWorkspaceMember(member) : undefined;
  }

  async getWorkspaceMembers(workspaceId: number | string): Promise<(WorkspaceMember & { user: User })[]> {
    await this.connect();
    console.log('[MONGODB DEBUG] Getting workspace members for workspace:', workspaceId);
    
    try {
      const members = await WorkspaceMemberModel.find({ 
        workspaceId: workspaceId.toString() 
      }).maxTimeMS(5000); // 5 second timeout
      
      console.log('[MONGODB DEBUG] Found workspace members:', members.length);
      
      const result = [];
      for (const member of members) {
        const user = await this.getUser(member.userId);
        if (user) {
          result.push({
            ...this.convertWorkspaceMember(member),
            user
          });
        }
      }
      
      // If no members found, add the workspace owner as a member (simplified approach)
      if (result.length === 0) {
        console.log('[MONGODB DEBUG] No members found, adding workspace owner');
        const workspace = await this.getWorkspace(workspaceId);
        if (workspace) {
          const owner = await this.getUser(workspace.userId);
          if (owner) {
            const ownerMember: WorkspaceMember & { user: User } = {
              id: 1,
              userId: workspace.userId,
              workspaceId: parseInt(workspaceId.toString()),
              role: 'Owner',
              status: 'active',
              permissions: null,
              invitedBy: null,
              joinedAt: workspace.createdAt,
              createdAt: workspace.createdAt,
              updatedAt: workspace.updatedAt,
              user: owner
            };
            result.push(ownerMember);
            console.log('[MONGODB DEBUG] Added owner as member:', owner.username);
          }
        }
      }
      
      console.log('[MONGODB DEBUG] Returning members:', result.length);
      return result;
    } catch (error) {
      console.error('[MONGODB DEBUG] Error getting workspace members:', error);
      // Return just the owner as fallback
      const workspace = await this.getWorkspace(workspaceId);
      if (workspace) {
        const owner = await this.getUser(workspace.userId);
        if (owner) {
          const ownerMember: WorkspaceMember & { user: User } = {
            id: 1,
            userId: typeof workspace.userId === 'string' ? parseInt(workspace.userId) : workspace.userId,
            workspaceId: typeof workspaceId === 'string' ? parseInt(workspaceId) : workspaceId,
            role: 'Owner',
            status: 'active',
            permissions: null,
            invitedBy: null,
            joinedAt: workspace.createdAt,
            createdAt: workspace.createdAt,
            updatedAt: workspace.updatedAt,
            user: owner
          };
          return [ownerMember];
        }
      }
      return [];
    }
  }

  async addWorkspaceMember(member: InsertWorkspaceMember): Promise<WorkspaceMember> {
    await this.connect();
    
    const memberData = {
      ...member,
      id: Date.now(),
      status: 'active',
      joinedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const newMember = new WorkspaceMemberModel(memberData);
    await newMember.save();
    
    return this.convertWorkspaceMember(newMember);
  }

  async updateWorkspaceMember(workspaceId: number | string, userId: number | string, updates: Partial<WorkspaceMember>): Promise<WorkspaceMember> {
    await this.connect();
    
    const updatedMember = await WorkspaceMemberModel.findOneAndUpdate(
      { workspaceId: workspaceId.toString(), userId: userId.toString() },
      { ...updates, updatedAt: new Date() },
      { new: true }
    );
    
    if (!updatedMember) {
      throw new Error(`Workspace member not found`);
    }
    
    return this.convertWorkspaceMember(updatedMember);
  }

  async removeWorkspaceMember(workspaceId: number | string, userId: number | string): Promise<void> {
    await this.connect();
    await WorkspaceMemberModel.deleteOne({ 
      workspaceId: workspaceId.toString(), 
      userId: userId.toString() 
    });
  }

  async createTeamInvitation(invitation: InsertTeamInvitation): Promise<TeamInvitation> {
    await this.connect();
    
    const invitationData = {
      ...invitation,
      id: Date.now(),
      status: 'pending',
      createdAt: new Date()
    };

    const newInvitation = new TeamInvitationModel(invitationData);
    await newInvitation.save();
    
    console.log(`[MONGODB DEBUG] Created team invitation:`, {
      email: newInvitation.email,
      workspaceId: newInvitation.workspaceId,
      status: newInvitation.status,
      id: newInvitation._id
    });
    
    return this.convertTeamInvitation(newInvitation);
  }

  async getWorkspaceInvitations(workspaceId: number): Promise<TeamInvitation[]> {
    await this.connect();
    
    console.log(`[MONGODB DEBUG] Getting invitations for workspace: ${workspaceId}`);
    
    const invitations = await TeamInvitationModel.find({
      $or: [
        { workspaceId: workspaceId.toString() },
        { workspaceId: workspaceId }
      ],
      status: 'pending'
    }).sort({ createdAt: -1 });
    
    console.log(`[MONGODB DEBUG] Found ${invitations.length} pending invitations`);
    
    return invitations.map(doc => this.convertTeamInvitation(doc));
  }

  async getTeamInvitation(id: number): Promise<TeamInvitation | undefined> {
    await this.connect();
    const invitation = await TeamInvitationModel.findOne({ id });
    return invitation ? this.convertTeamInvitation(invitation) : undefined;
  }

  async getTeamInvitationByToken(token: string): Promise<TeamInvitation | undefined> {
    await this.connect();
    const invitation = await TeamInvitationModel.findOne({ token });
    return invitation ? this.convertTeamInvitation(invitation) : undefined;
  }

  async getTeamInvitations(workspaceId: number | string, status?: string): Promise<TeamInvitation[]> {
    await this.connect();
    const query: any = { workspaceId: workspaceId.toString() };
    if (status) {
      query.status = status;
    }
    
    const invitations = await TeamInvitationModel.find(query)
      .sort({ createdAt: -1 });
    
    return invitations.map(this.convertTeamInvitation);
  }

  async updateTeamInvitation(id: number, updates: Partial<TeamInvitation>): Promise<TeamInvitation> {
    await this.connect();
    
    const updatedInvitation = await TeamInvitationModel.findOneAndUpdate(
      { id },
      updates,
      { new: true }
    );
    
    if (!updatedInvitation) {
      throw new Error(`Team invitation with id ${id} not found`);
    }
    
    return this.convertTeamInvitation(updatedInvitation);
  }

  private convertWorkspaceMember(doc: any): WorkspaceMember {
    return {
      id: parseInt(doc._id?.toString() || doc.id || "0"),
      userId: parseInt(doc.userId?.toString() || "0"),
      workspaceId: parseInt(doc.workspaceId?.toString() || "0"),
      role: doc.role || "Viewer",
      status: doc.status || "active",
      permissions: doc.permissions || {},
      invitedBy: doc.invitedBy ? parseInt(doc.invitedBy.toString()) : null,
      joinedAt: doc.joinedAt || new Date(),
      createdAt: doc.createdAt || new Date(),
      updatedAt: doc.updatedAt || new Date()
    };
  }

  private convertTeamInvitation(doc: any): TeamInvitation {
    return {
      id: doc._id?.toString() || doc.id,
      workspaceId: parseInt(doc.workspaceId),
      email: doc.email,
      role: doc.role,
      status: doc.status || null,
      token: doc.token,
      expiresAt: doc.expiresAt,
      invitedBy: doc.invitedBy,
      permissions: doc.permissions || null,
      acceptedAt: doc.acceptedAt || null,
      createdAt: doc.createdAt || null
    };
  }

  // Content recommendation operations
  async getContentRecommendation(id: number): Promise<ContentRecommendation | undefined> {
    await this.connect();
    const recommendation = await ContentRecommendationModel.findById(id);
    return recommendation ? this.convertContentRecommendation(recommendation) : undefined;
  }

  async getContentRecommendations(workspaceId: number, type?: string, limit?: number): Promise<ContentRecommendation[]> {
    await this.connect();
    const query: any = { workspaceId: workspaceId.toString(), isActive: true };
    
    if (type) {
      query.type = type;
    }

    const queryBuilder = ContentRecommendationModel.find(query).sort({ createdAt: -1 });
    
    if (limit) {
      queryBuilder.limit(limit);
    }

    const recommendations = await queryBuilder.exec();
    return recommendations.map(rec => this.convertContentRecommendation(rec));
  }

  async createContentRecommendation(insertRecommendation: InsertContentRecommendation): Promise<ContentRecommendation> {
    await this.connect();
    const recommendation = new ContentRecommendationModel({
      ...insertRecommendation,
      workspaceId: insertRecommendation.workspaceId.toString(),
      createdAt: new Date(),
      updatedAt: new Date()
    });
    const saved = await recommendation.save();
    return this.convertContentRecommendation(saved);
  }

  async updateContentRecommendation(id: number, updates: Partial<ContentRecommendation>): Promise<ContentRecommendation> {
    await this.connect();
    const updated = await ContentRecommendationModel.findByIdAndUpdate(
      id,
      { ...updates, updatedAt: new Date() },
      { new: true }
    );
    if (!updated) {
      throw new Error(`Content recommendation ${id} not found`);
    }
    return this.convertContentRecommendation(updated);
  }

  async deleteContentRecommendation(id: number): Promise<void> {
    await this.connect();
    const result = await ContentRecommendationModel.deleteOne({ _id: id });
    if (result.deletedCount === 0) {
      throw new Error(`Content recommendation ${id} not found`);
    }
  }

  async getUserContentHistory(userId: number, workspaceId: number): Promise<UserContentHistory[]> {
    await this.connect();
    const history = await UserContentHistoryModel.find({
      userId: userId.toString(),
      workspaceId: workspaceId.toString()
    }).sort({ createdAt: -1 });
    return history.map(h => this.convertUserContentHistory(h));
  }

  async createUserContentHistory(insertHistory: InsertUserContentHistory): Promise<UserContentHistory> {
    await this.connect();
    const history = new UserContentHistoryModel({
      ...insertHistory,
      userId: insertHistory.userId.toString(),
      workspaceId: insertHistory.workspaceId.toString(),
      createdAt: new Date()
    });
    const saved = await history.save();
    return this.convertUserContentHistory(saved);
  }

  private convertContentRecommendation(doc: any): ContentRecommendation {
    return {
      id: doc._id?.toString() || doc.id,
      workspaceId: parseInt(doc.workspaceId),
      type: doc.type,
      title: doc.title,
      description: doc.description || null,
      duration: doc.duration || null,
      category: doc.category,
      country: doc.country,
      tags: doc.tags || [],
      engagement: doc.engagement || { expectedViews: 0, expectedLikes: 0, expectedShares: 0 },
      thumbnailUrl: doc.thumbnailUrl || null,
      mediaUrl: doc.mediaUrl || null,
      sourceUrl: doc.sourceUrl || null,
      isActive: doc.isActive !== false,
      createdAt: doc.createdAt || null,
      updatedAt: doc.updatedAt || null
    };
  }

  private convertUserContentHistory(doc: any): UserContentHistory {
    return {
      id: doc._id?.toString() || doc.id,
      userId: parseInt(doc.userId),
      workspaceId: parseInt(doc.workspaceId),
      action: doc.action,
      recommendationId: doc.recommendationId || null,
      metadata: doc.metadata || {},
      createdAt: doc.createdAt || null
    };
  }

  // Pricing and plan operations
  async getPricingData(): Promise<any> {
    return {
      plans: {
        free: {
          id: "free",
          name: "Cosmic Explorer",
          description: "Perfect for getting started in the social universe",
          price: "Free",
          credits: 50,
          features: [
            "Up to 2 social accounts",
            "Basic analytics dashboard",
            "50 AI-generated posts per month",
            "Community support",
            "Basic scheduling"
          ]
        },
        pro: {
          id: "pro", 
          name: "Stellar Navigator",
          description: "Advanced features for growing brands",
          price: 999,
          credits: 500,
          features: [
            "Up to 10 social accounts",
            "Advanced analytics & insights",
            "500 AI-generated posts per month",
            "Priority support",
            "Advanced scheduling",
            "Custom AI personality",
            "Hashtag optimization"
          ],
          popular: true
        },
        enterprise: {
          id: "enterprise",
          name: "Galactic Commander", 
          description: "Ultimate power for large teams",
          price: 2999,
          credits: 2000,
          features: [
            "Unlimited social accounts",
            "Enterprise analytics suite",
            "2000 AI-generated posts per month",
            "24/7 dedicated support",
            "Advanced team collaboration",
            "Custom integrations",
            "White-label options"
          ]
        }
      },
      creditPackages: [
        {
          id: "credits_100",
          name: "Starter Pack",
          totalCredits: 100,
          price: 199,
          savings: "20% off"
        },
        {
          id: "credits_500",
          name: "Power Pack",
          totalCredits: 500,
          price: 799,
          savings: "30% off"
        },
        {
          id: "credits_1000",
          name: "Mega Pack",
          totalCredits: 1000,
          price: 1399,
          savings: "40% off"
        }
      ],
      addons: {
        extra_workspace: {
          id: "extra_workspace",
          name: "Additional Brand Workspace",
          price: 49,
          type: "workspace",
          interval: "monthly",
          benefit: "Add 1 extra brand workspace for team collaboration"
        },
        extra_social_account: {
          id: "extra_social_account", 
          name: "Extra Social Account",
          price: 49,
          type: "social_connection",
          interval: "monthly",
          benefit: "Connect 1 additional social media account"
        },
        boosted_ai_content: {
          id: "boosted_ai_content",
          name: "Boosted AI Content Generation", 
          price: 99,
          type: "ai_boost",
          interval: "monthly",
          benefit: "Generate 500 extra AI-powered posts per month"
        }
      }
    };
  }

  async updateUserSubscription(userId: number | string, planId: string): Promise<User> {
    await this.connect();
    console.log(`[SUBSCRIPTION UPDATE] Looking for user with ID: ${userId} (type: ${typeof userId})`);
    
    let user;
    try {
      // Try by MongoDB _id first (ObjectId format)
      user = await UserModel.findById(userId);
      console.log(`[SUBSCRIPTION UPDATE] Find by _id result:`, user ? 'Found' : 'Not found');
    } catch (objectIdError) {
      console.log(`[SUBSCRIPTION UPDATE] ObjectId lookup failed, trying by 'id' field`);
      
      // If ObjectId fails, try by the 'id' field
      const userIdStr = userId.toString();
      user = await UserModel.findOne({ id: userIdStr });
      console.log(`[SUBSCRIPTION UPDATE] Find by id field result:`, user ? 'Found' : 'Not found');
    }
    
    if (!user) {
      throw new Error(`User with id ${userId} not found`);
    }
    
    // Get plan credits from pricing config
    const { SUBSCRIPTION_PLANS } = await import('./pricing-config');
    const plan = SUBSCRIPTION_PLANS[planId];
    
    if (!plan) {
      throw new Error(`Invalid plan ID: ${planId}`);
    }
    
    // Update the user's subscription plan AND ADD the monthly credits (additive)
    const updatedUser = await UserModel.findByIdAndUpdate(
      user._id,
      { 
        plan: planId, 
        $inc: { credits: plan.credits },  // Add to existing credits instead of replacing
        updatedAt: new Date() 
      },
      { new: true }
    );
    
    if (!updatedUser) {
      throw new Error(`Failed to update user subscription for id ${userId}`);
    }
    
    console.log(`[SUBSCRIPTION UPDATE] Successfully updated user ${userId} to plan ${planId} with ${plan.credits} credits`);
    return this.convertUser(updatedUser);
  }

  async addCreditsToUser(userId: number | string, credits: number): Promise<User> {
    await this.connect();
    console.log(`[CREDIT ADD] Looking for user with ID: ${userId} (type: ${typeof userId})`);
    
    let user;
    try {
      // Try by MongoDB _id first (ObjectId format)
      user = await UserModel.findById(userId);
      console.log(`[CREDIT ADD] Find by _id result:`, user ? 'Found' : 'Not found');
    } catch (objectIdError) {
      console.log(`[CREDIT ADD] ObjectId lookup failed, trying by 'id' field`);
      
      // If ObjectId fails, try by the 'id' field
      const userIdStr = userId.toString();
      user = await UserModel.findOne({ id: userIdStr });
      console.log(`[CREDIT ADD] Find by id field result:`, user ? 'Found' : 'Not found');
    }
    
    if (!user) {
      throw new Error(`User with id ${userId} not found`);
    }
    
    const currentCredits = user.credits || 0;
    const newCredits = currentCredits + credits;
    console.log(`[CREDIT ADD] Current credits: ${currentCredits}, adding: ${credits}, new total: ${newCredits}`);
    
    let updatedUser;
    try {
      // Try updating by MongoDB _id first
      updatedUser = await UserModel.findByIdAndUpdate(
        user._id,
        { credits: newCredits, updatedAt: new Date() },
        { new: true }
      );
    } catch (error) {
      // Fallback to updating by id field
      updatedUser = await UserModel.findOneAndUpdate(
        { id: user.id },
        { credits: newCredits, updatedAt: new Date() },
        { new: true }
      );
    }
    
    if (!updatedUser) {
      throw new Error(`Failed to update credits for user ${userId}`);
    }
    
    console.log(`[CREDIT ADD] Successfully updated user ${userId} credits to ${newCredits}`);
    return this.convertUser(updatedUser);
  }

  // DM Conversation Memory Methods
  async getDmConversation(workspaceId: string, platform: string, participantId: string): Promise<any> {
    await this.connect();
    
    const conversation = await DmConversationModel.findOne({
      workspaceId,
      platform,
      participantId
    });
    
    if (!conversation) return null;
    
    return {
      id: conversation._id.toString(),
      workspaceId: conversation.workspaceId,
      platform: conversation.platform,
      participantId: conversation.participantId,
      participantUsername: conversation.participantUsername,
      lastMessageAt: conversation.lastMessageAt,
      messageCount: conversation.messageCount,
      isActive: conversation.isActive,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt
    };
  }

  async createDmConversation(data: any): Promise<any> {
    await this.connect();
    
    const conversation = new DmConversationModel(data);
    const saved = await conversation.save();
    
    return {
      id: saved._id.toString(),
      workspaceId: saved.workspaceId,
      platform: saved.platform,
      participantId: saved.participantId,
      participantUsername: saved.participantUsername,
      lastMessageAt: saved.lastMessageAt,
      messageCount: saved.messageCount,
      isActive: saved.isActive,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt
    };
  }

  async createDmMessage(data: any): Promise<any> {
    await this.connect();
    
    const message = new DmMessageModel(data);
    const saved = await message.save();
    
    return {
      id: saved._id.toString(),
      conversationId: saved.conversationId,
      messageId: saved.messageId,
      sender: saved.sender,
      content: saved.content,
      messageType: saved.messageType,
      sentiment: saved.sentiment,
      topics: saved.topics,
      aiResponse: saved.aiResponse,
      automationRuleId: saved.automationRuleId,
      createdAt: saved.createdAt
    };
  }

  async updateConversationLastMessage(conversationId: string | number): Promise<void> {
    await this.connect();
    
    await DmConversationModel.findByIdAndUpdate(conversationId, {
      lastMessageAt: new Date(),
      $inc: { messageCount: 1 },
      updatedAt: new Date()
    });
  }

  async getDmMessages(conversationId: number | string, limit: number = 10): Promise<any[]> {
    await this.connect();
    
    console.log(`[MONGODB] Getting authentic DM messages for conversation: ${conversationId}`);
    
    // Try multiple message models and collections
    const messageModels = ['DmMessage', 'Message', 'InstagramMessage', 'ConversationMessage'];
    let allMessages = [];
    
    for (const modelName of messageModels) {
      try {
        const Model = mongoose.models[modelName];
        if (Model) {
          const messages = await Model.find({
            $or: [
              { conversationId: conversationId },
              { conversationId: conversationId.toString() },
              { conversation: conversationId },
              { conversation: conversationId.toString() }
            ]
          }).sort({ createdAt: -1 });
          
          console.log(`[MONGODB] Found ${messages.length} messages in ${modelName} for conversation ${conversationId}`);
          allMessages.push(...messages);
        }
      } catch (error) {
        console.log(`[MONGODB] Error accessing ${modelName}: ${error.message}`);
      }
    }
    
    // Also search generic message collections
    try {
      const db = mongoose.connection.db;
      const collections = await db.listCollections().toArray();
      
      for (const collection of collections) {
        if (collection.name.toLowerCase().includes('message') || 
            collection.name.toLowerCase().includes('dm')) {
          try {
            const docs = await db.collection(collection.name).find({
              $or: [
                { conversationId: conversationId },
                { conversationId: conversationId.toString() },
                { conversation: conversationId },
                { conversation: conversationId.toString() }
              ]
            }).limit(20).toArray();
            
            if (docs.length > 0) {
              console.log(`[MONGODB] Collection ${collection.name} has ${docs.length} messages for conversation ${conversationId}`);
              allMessages.push(...docs.map(doc => ({
                ...doc,
                _id: doc._id,
                collectionSource: collection.name
              })));
            }
          } catch (err) {
            console.log(`[MONGODB] Error querying ${collection.name}: ${err.message}`);
          }
        }
      }
    } catch (error) {
      console.log(`[MONGODB] Error listing collections: ${error.message}`);
    }
    
    // Sort by creation date and limit
    const sortedMessages = allMessages
      .sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime())
      .slice(0, limit);
    
    console.log(`[MONGODB] Returning ${sortedMessages.length} authentic messages for conversation ${conversationId}`);
    
    return sortedMessages.map(msg => ({
      id: msg._id.toString(),
      conversationId: msg.conversationId || msg.conversation,
      messageId: msg.messageId || msg.id,
      sender: msg.sender || msg.from || 'user',
      content: msg.content || msg.message || msg.text,
      messageType: msg.messageType || msg.type || 'text',
      sentiment: msg.sentiment || 'neutral',
      topics: msg.topics || [],
      aiResponse: msg.aiResponse,
      automationRuleId: msg.automationRuleId,
      createdAt: msg.createdAt,
      collectionSource: msg.collectionSource
    }));
  }

  async getConversationContext(conversationId: number): Promise<any[]> {
    await this.connect();
    
    const context = await ConversationContextModel.find({
      conversationId,
      $or: [
        { expiresAt: { $exists: false } },
        { expiresAt: null },
        { expiresAt: { $gt: new Date() } }
      ]
    }).sort({ extractedAt: -1 });
    
    return context.map(ctx => ({
      id: ctx._id.toString(),
      conversationId: ctx.conversationId,
      contextType: ctx.contextType,
      contextValue: ctx.contextValue,
      confidence: ctx.confidence,
      extractedAt: ctx.extractedAt,
      expiresAt: ctx.expiresAt
    }));
  }

  async createConversationContext(data: any): Promise<any> {
    await this.connect();
    
    const context = new ConversationContextModel(data);
    const saved = await context.save();
    
    return {
      id: saved._id.toString(),
      conversationId: saved.conversationId,
      contextType: saved.contextType,
      contextValue: saved.contextValue,
      confidence: saved.confidence,
      extractedAt: saved.extractedAt,
      expiresAt: saved.expiresAt
    };
  }

  async cleanupExpiredContext(cutoffDate: Date): Promise<void> {
    await this.connect();
    
    await ConversationContextModel.deleteMany({
      expiresAt: { $lt: cutoffDate }
    });
  }

  async cleanupOldMessages(cutoffDate: Date): Promise<void> {
    await this.connect();
    
    await DmMessageModel.deleteMany({
      createdAt: { $lt: cutoffDate }
    });
  }

  async getConversationStats(workspaceId: string): Promise<{
    totalConversations: number;
    activeConversations: number;
    totalMessages: number;
    averageResponseTime: number;
  }> {
    await this.connect();
    
    const totalConversations = await DmConversationModel.countDocuments({ workspaceId });
    const activeConversations = await DmConversationModel.countDocuments({ 
      workspaceId, 
      isActive: true,
      lastMessageAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    });
    const totalMessages = await DmMessageModel.countDocuments({
      conversationId: { $in: await DmConversationModel.find({ workspaceId }).distinct('_id') }
    });
    
    return {
      totalConversations,
      activeConversations,
      totalMessages,
      averageResponseTime: 0 // Placeholder for now
    };
  }

  // Add missing method for getDmConversations
  async getDmConversations(workspaceId: string, limit: number = 50): Promise<any[]> {
    await this.connect();
    
    console.log(`[MONGODB] Getting authentic Instagram DM conversations for workspace: ${workspaceId}`);
    
    // Access all DM conversation models to find authentic data
    const models = ['DmConversation', 'Conversation', 'InstagramConversation'];
    let allConversations = [];
    
    for (const modelName of models) {
      try {
        const Model = mongoose.models[modelName];
        if (Model) {
          const conversations = await Model.find({ 
            $or: [
              { workspaceId: workspaceId },
              { workspaceId: workspaceId.toString() }
            ]
          }).sort({ createdAt: -1 });
          
          console.log(`[MONGODB] Found ${conversations.length} conversations in ${modelName}`);
          allConversations.push(...conversations);
        }
      } catch (error) {
        console.log(`[MONGODB] Error accessing ${modelName}: ${error.message}`);
      }
    }
    
    // Also check generic collections that might contain authentic Instagram DMs
    try {
      const db = mongoose.connection.db;
      const collections = await db.listCollections().toArray();
      
      for (const collection of collections) {
        if (collection.name.toLowerCase().includes('conversation') || 
            collection.name.toLowerCase().includes('message')) {
          console.log(`[MONGODB] Found collection: ${collection.name}`);
          
          try {
            const docs = await db.collection(collection.name).find({
              $or: [
                { workspaceId: workspaceId },
                { workspaceId: workspaceId.toString() }
              ]
            }).limit(10).toArray();
            
            if (docs.length > 0) {
              console.log(`[MONGODB] Collection ${collection.name} has ${docs.length} relevant documents`);
              allConversations.push(...docs.map(doc => ({
                ...doc,
                _id: doc._id,
                collectionSource: collection.name
              })));
            }
          } catch (err) {
            console.log(`[MONGODB] Error querying ${collection.name}: ${err.message}`);
          }
        }
      }
    } catch (error) {
      console.log(`[MONGODB] Error listing collections: ${error.message}`);
    }
    
    console.log(`[MONGODB] Total conversations found across all sources: ${allConversations.length}`);
    
    // Sort and limit results
    const sortedConversations = allConversations
      .sort((a, b) => new Date(b.createdAt || b.lastActive || 0).getTime() - new Date(a.createdAt || a.lastActive || 0).getTime())
      .slice(0, limit);
    
    return sortedConversations.map(conv => ({
      id: conv._id.toString(),
      workspaceId: conv.workspaceId,
      platform: conv.platform || 'instagram',
      participantId: conv.participant?.id || conv.participantId || 'unknown_user',
      participantUsername: conv.participant?.username || conv.participantUsername || 'Instagram User',
      lastMessageAt: conv.lastActive || conv.lastMessageAt || conv.createdAt,
      messageCount: conv.messageCount || 1,
      isActive: conv.isActive !== false,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt || conv.lastActive,
      collectionSource: conv.collectionSource
    }));
  }

  // Add method for getAutomationRulesByTrigger
  async getAutomationRulesByTrigger(triggerType: string): Promise<any[]> {
    await this.connect();
    
    const rules = await AutomationRuleModel.find({
      'trigger.type': triggerType,
      isActive: true
    });
    
    return rules.map(rule => ({
      id: rule._id.toString(),
      name: rule.name,
      workspaceId: rule.workspaceId,
      description: rule.description,
      isActive: rule.isActive,
      trigger: rule.trigger,
      action: rule.action,
      lastRun: rule.lastRun,
      nextRun: rule.nextRun,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt
    }));
  }

  // Admin operations
  async getAdmin(id: number): Promise<Admin | undefined> {
    await this.connect();
    try {
      const admin = await AdminModel.findById(id);
      return admin ? this.convertAdmin(admin) : undefined;
    } catch (error) {
      return undefined;
    }
  }

  async getAdminByEmail(email: string): Promise<Admin | undefined> {
    await this.connect();
    const admin = await AdminModel.findOne({ email });
    return admin ? this.convertAdmin(admin) : undefined;
  }

  async getAdminByUsername(username: string): Promise<Admin | undefined> {
    await this.connect();
    const admin = await AdminModel.findOne({ username });
    return admin ? this.convertAdmin(admin) : undefined;
  }

  async getAllAdmins(): Promise<Admin[]> {
    await this.connect();
    const admins = await AdminModel.find({ isActive: true });
    return admins.map(admin => this.convertAdmin(admin));
  }

  async createAdmin(admin: InsertAdmin): Promise<Admin> {
    await this.connect();
    const newAdmin = new AdminModel({
      email: admin.email,
      username: admin.username,
      password: admin.password,
      role: admin.role || 'admin',
      isActive: true
    });
    const savedAdmin = await newAdmin.save();
    return this.convertAdmin(savedAdmin);
  }

  async updateAdmin(id: number, updates: Partial<Admin>): Promise<Admin> {
    await this.connect();
    const admin = await AdminModel.findByIdAndUpdate(
      id,
      { ...updates, updatedAt: new Date() },
      { new: true }
    );
    if (!admin) throw new Error('Admin not found');
    return this.convertAdmin(admin);
  }

  async deleteAdmin(id: number): Promise<void> {
    await this.connect();
    await AdminModel.findByIdAndUpdate(id, { isActive: false });
  }

  async getAdminUsers(options: {
    page: number;
    limit: number;
    search?: string;
    filter?: string;
  }): Promise<any> {
    await this.connect();
    
    const { page, limit, search, filter } = options;
    const skip = (page - 1) * limit;
    
    // Build query
    let query: any = {};
    
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { displayName: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (filter && filter !== 'all') {
      switch (filter) {
        case 'active':
          query.lastLogin = { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
          break;
        case 'premium':
          query.plan = { $ne: null, $ne: 'free' };
          break;
        case 'free':
          query.$or = [{ plan: 'free' }, { plan: null }];
          break;
      }
    }
    
    const [users, total] = await Promise.all([
      UserModel.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      UserModel.countDocuments(query)
    ]);
    
    const formattedUsers = users.map(user => ({
      id: user._id.toString(),
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      plan: user.plan || 'free',
      credits: user.credits || 0,
      lastLogin: user.lastLogin,
      status: user.isActive !== false ? 'active' : 'inactive',
      createdAt: user.createdAt,
      totalWorkspaces: 0 // Will be calculated separately if needed
    }));
    
    return {
      users: formattedUsers,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }





  // Admin session operations
  async createAdminSession(session: any): Promise<any> {
    await this.connect();
    const newSession = new AdminSessionModel({
      adminId: session.adminId,
      token: session.token,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      expiresAt: session.expiresAt
    });
    const savedSession = await newSession.save();
    return this.convertAdminSession(savedSession);
  }

  async getAdminSession(token: string): Promise<any | undefined> {
    await this.connect();
    const session = await AdminSessionModel.findOne({ 
      token, 
      expiresAt: { $gt: new Date() } 
    }).populate('adminId');
    return session ? this.convertAdminSession(session) : undefined;
  }

  async deleteAdminSession(token: string): Promise<void> {
    await this.connect();
    await AdminSessionModel.deleteOne({ token });
  }

  async cleanupExpiredSessions(): Promise<void> {
    await this.connect();
    await AdminSessionModel.deleteMany({ expiresAt: { $lt: new Date() } });
  }

  // Notification operations
  async createNotification(notification: any): Promise<any> {
    await this.connect();
    
    console.log('[MONGODB DEBUG] Creating notification:', notification);
    
    const notificationData = {
      userId: notification.userId || null,
      title: notification.title,
      message: notification.message,
      type: notification.type || 'info',
      targetUsers: Array.isArray(notification.targetUsers) ? notification.targetUsers : [notification.targetUsers || 'all'],
      scheduledFor: notification.scheduledFor || null,
      sentAt: notification.scheduledFor ? null : new Date(),
      isRead: false,
      createdAt: new Date()
    };
    
    const newNotification = new NotificationModel(notificationData);
    const savedNotification = await newNotification.save();
    
    console.log('[MONGODB DEBUG] Notification created with ID:', savedNotification._id);
    
    return {
      id: savedNotification._id.toString(),
      userId: savedNotification.userId,
      title: savedNotification.title,
      message: savedNotification.message,
      type: savedNotification.type,
      targetUsers: savedNotification.targetUsers,
      scheduledFor: savedNotification.scheduledFor,
      sentAt: savedNotification.sentAt,
      isRead: savedNotification.isRead,
      createdAt: savedNotification.createdAt
    };
  }

  async getUserNotifications(userId: string): Promise<any[]> {
    await this.connect();
    
    console.log('[NOTIFICATIONS] Fetching notifications for user:', userId);
    
    // Find notifications targeted to this user or to all users
    // Note: We exclude userId field check since admin notifications use targetUsers field
    const notifications = await NotificationModel.find({
      targetUsers: 'all'
    }).sort({ createdAt: -1 }).limit(50);
    
    console.log('[NOTIFICATIONS] Found notifications:', notifications.length);
    
    return notifications.map(notification => ({
      id: notification._id.toString(),
      userId: notification.userId,
      title: notification.title,
      message: notification.message,
      type: notification.type,
      targetUsers: notification.targetUsers,
      scheduledFor: notification.scheduledFor,
      sentAt: notification.sentAt,
      isRead: notification.isRead,
      createdAt: notification.createdAt
    }));
  }

  async markNotificationAsRead(notificationId: string, userId: string): Promise<void> {
    await this.connect();
    
    console.log('[NOTIFICATIONS] Marking notification as read:', notificationId, 'for user:', userId);
    
    await NotificationModel.updateOne(
      { 
        _id: notificationId,
        $or: [
          { targetUsers: 'all' },
          { targetUsers: { $in: [userId] } }
        ]
      },
      { $set: { isRead: true } }
    );
  }

  async getNotifications(userId?: number): Promise<any[]> {
    await this.connect();
    const query = userId ? { userId } : {};
    const notifications = await NotificationModel.find(query).sort({ createdAt: -1 });
    return notifications.map(notif => this.convertNotification(notif));
  }

  async updateNotification(id: number, updates: Partial<any>): Promise<any> {
    await this.connect();
    const notification = await NotificationModel.findByIdAndUpdate(
      id,
      { ...updates, updatedAt: new Date() },
      { new: true }
    );
    if (!notification) throw new Error('Notification not found');
    return this.convertNotification(notification);
  }

  async deleteNotification(id: number): Promise<void> {
    await this.connect();
    await NotificationModel.findByIdAndDelete(id);
  }

  async markNotificationRead(id: number): Promise<void> {
    await this.connect();
    await NotificationModel.findByIdAndUpdate(id, { isRead: true });
  }

  // Popup operations
  async createPopup(popup: any): Promise<any> {
    await this.connect();
    const newPopup = new PopupModel(popup);
    const savedPopup = await newPopup.save();
    return this.convertPopup(savedPopup);
  }

  async getActivePopups(): Promise<any[]> {
    await this.connect();
    const popups = await PopupModel.find({ 
      isActive: true,
      $or: [
        { startDate: { $exists: false } },
        { startDate: { $lte: new Date() } }
      ],
      $or: [
        { endDate: { $exists: false } },
        { endDate: { $gte: new Date() } }
      ]
    });
    return popups.map(popup => this.convertPopup(popup));
  }

  async getPopup(id: number): Promise<any | undefined> {
    await this.connect();
    const popup = await PopupModel.findById(id);
    return popup ? this.convertPopup(popup) : undefined;
  }

  async updatePopup(id: number, updates: Partial<any>): Promise<any> {
    await this.connect();
    const popup = await PopupModel.findByIdAndUpdate(
      id,
      { ...updates, updatedAt: new Date() },
      { new: true }
    );
    if (!popup) throw new Error('Popup not found');
    return this.convertPopup(popup);
  }

  async deletePopup(id: number): Promise<void> {
    await this.connect();
    await PopupModel.findByIdAndDelete(id);
  }

  // App settings operations
  async createAppSetting(setting: any): Promise<any> {
    await this.connect();
    const newSetting = new AppSettingModel(setting);
    const savedSetting = await newSetting.save();
    return this.convertAppSetting(savedSetting);
  }

  async getAppSetting(key: string): Promise<any | undefined> {
    await this.connect();
    const setting = await AppSettingModel.findOne({ key });
    return setting ? this.convertAppSetting(setting) : undefined;
  }

  async getAllAppSettings(): Promise<any[]> {
    await this.connect();
    const settings = await AppSettingModel.find({});
    return settings.map(setting => this.convertAppSetting(setting));
  }

  async getPublicAppSettings(): Promise<any[]> {
    await this.connect();
    const settings = await AppSettingModel.find({ isPublic: true });
    return settings.map(setting => this.convertAppSetting(setting));
  }

  async updateAppSetting(key: string, value: string, updatedBy?: number): Promise<any> {
    await this.connect();
    const setting = await AppSettingModel.findOneAndUpdate(
      { key },
      { value, updatedBy, updatedAt: new Date() },
      { new: true, upsert: true }
    );
    return this.convertAppSetting(setting);
  }

  async deleteAppSetting(key: string): Promise<void> {
    await this.connect();
    await AppSettingModel.deleteOne({ key });
  }

  // Audit log operations
  async createAuditLog(log: any): Promise<any> {
    await this.connect();
    
    // Backward compatibility: derive actorType and actorId from adminId if not provided
    const enrichedLog = { ...log };
    if (!enrichedLog.actorType) {
      enrichedLog.actorType = enrichedLog.adminId ? 'admin' : 'system';
    }
    if (!enrichedLog.actorId) {
      enrichedLog.actorId = enrichedLog.adminId ? String(enrichedLog.adminId) : 'system';
    }
    
    const newLog = new AuditLogModel(enrichedLog);
    const savedLog = await newLog.save();
    return this.convertAuditLog(savedLog);
  }

  async getAuditLogs(limit?: number, adminId?: number): Promise<any[]> {
    await this.connect();
    const query = adminId ? { adminId } : {};
    const logs = await AuditLogModel.find(query)
      .sort({ createdAt: -1 })
      .limit(limit || 100);
    return logs.map(log => this.convertAuditLog(log));
  }

  // Feedback operations
  async createFeedbackMessage(feedback: any): Promise<any> {
    await this.connect();
    const newFeedback = new FeedbackMessageModel(feedback);
    const savedFeedback = await newFeedback.save();
    return this.convertFeedbackMessage(savedFeedback);
  }

  async getFeedbackMessages(status?: string): Promise<any[]> {
    await this.connect();
    const query = status ? { status } : {};
    const messages = await FeedbackMessageModel.find(query).sort({ createdAt: -1 });
    return messages.map(msg => this.convertFeedbackMessage(msg));
  }

  async updateFeedbackMessage(id: number, updates: Partial<any>): Promise<any> {
    await this.connect();
    const message = await FeedbackMessageModel.findByIdAndUpdate(
      id,
      { ...updates, updatedAt: new Date() },
      { new: true }
    );
    if (!message) throw new Error('Feedback message not found');
    return this.convertFeedbackMessage(message);
  }

  async deleteFeedbackMessage(id: number): Promise<void> {
    await this.connect();
    await FeedbackMessageModel.findByIdAndDelete(id);
  }

  // Missing automation log methods
  async getAutomationLogs(limit?: number): Promise<any[]> {
    await this.connect();
    // Return empty array for now as automation logs schema not defined
    return [];
  }

  async createAutomationLog(log: any): Promise<any> {
    await this.connect();
    // Return the log object for now as automation logs schema not defined
    return { id: Date.now(), ...log, createdAt: new Date() };
  }

  // Get all users method for cleanup operations
  async getAllUsers(): Promise<any[]> {
    await this.connect();
    const users = await UserModel.find({}).lean();
    return users.map(user => this.convertUser(user));
  }

  // Admin stats method
  async getAdminStats(): Promise<any> {
    await this.connect();
    
    const [userCount, workspaceCount, contentCount] = await Promise.all([
      UserModel.countDocuments({}),
      WorkspaceModel.countDocuments({}),
      ContentModel.countDocuments({})
    ]);

    return {
      totalUsers: userCount,
      totalWorkspaces: workspaceCount,
      totalContent: contentCount,
      totalCreditsUsed: 0,
      revenueThisMonth: 0,
      activeUsers: userCount
    };
  }

  // Converter methods for admin entities
  private convertAdmin(mongoAdmin: any): any {
    return {
      id: mongoAdmin._id.toString(),
      email: mongoAdmin.email,
      username: mongoAdmin.username,
      password: mongoAdmin.password, // Include password for authentication
      role: mongoAdmin.role,
      isActive: mongoAdmin.isActive,
      lastLogin: mongoAdmin.lastLogin,
      createdAt: mongoAdmin.createdAt,
      updatedAt: mongoAdmin.updatedAt
    };
  }

  private convertAdminSession(mongoSession: any): any {
    return {
      id: mongoSession._id.toString(),
      adminId: mongoSession.adminId,
      token: mongoSession.token,
      ipAddress: mongoSession.ipAddress,
      userAgent: mongoSession.userAgent,
      expiresAt: mongoSession.expiresAt,
      createdAt: mongoSession.createdAt
    };
  }

  private convertNotification(mongoNotification: any): any {
    return {
      id: mongoNotification._id.toString(),
      userId: mongoNotification.userId,
      title: mongoNotification.title,
      message: mongoNotification.message,
      type: mongoNotification.type,
      priority: mongoNotification.priority,
      isRead: mongoNotification.isRead,
      actionUrl: mongoNotification.actionUrl,
      data: mongoNotification.data,
      expiresAt: mongoNotification.expiresAt,
      createdAt: mongoNotification.createdAt,
      updatedAt: mongoNotification.updatedAt
    };
  }

  private convertPopup(mongoPopup: any): any {
    return {
      id: mongoPopup._id.toString(),
      title: mongoPopup.title,
      content: mongoPopup.content,
      type: mongoPopup.type,
      priority: mongoPopup.priority,
      isActive: mongoPopup.isActive,
      targetUserType: mongoPopup.targetUserType,
      displayConditions: mongoPopup.displayConditions,
      actionButton: mongoPopup.actionButton,
      startDate: mongoPopup.startDate,
      endDate: mongoPopup.endDate,
      createdAt: mongoPopup.createdAt,
      updatedAt: mongoPopup.updatedAt
    };
  }

  private convertAppSetting(mongoSetting: any): any {
    return {
      id: mongoSetting._id.toString(),
      key: mongoSetting.key,
      value: mongoSetting.value,
      description: mongoSetting.description,
      category: mongoSetting.category,
      isPublic: mongoSetting.isPublic,
      updatedBy: mongoSetting.updatedBy,
      createdAt: mongoSetting.createdAt,
      updatedAt: mongoSetting.updatedAt
    };
  }

  private convertAuditLog(mongoLog: any): any {
    return {
      id: mongoLog._id.toString(),
      adminId: mongoLog.adminId,
      action: mongoLog.action,
      resource: mongoLog.resource,
      resourceId: mongoLog.resourceId,
      oldValues: mongoLog.oldValues,
      newValues: mongoLog.newValues,
      ipAddress: mongoLog.ipAddress,
      userAgent: mongoLog.userAgent,
      createdAt: mongoLog.createdAt
    };
  }

  private convertFeedbackMessage(mongoMessage: any): any {
    return {
      id: mongoMessage._id.toString(),
      userId: mongoMessage.userId,
      name: mongoMessage.name,
      email: mongoMessage.email,
      subject: mongoMessage.subject,
      message: mongoMessage.message,
      type: mongoMessage.type,
      status: mongoMessage.status,
      adminResponse: mongoMessage.adminResponse,
      respondedBy: mongoMessage.respondedBy,
      respondedAt: mongoMessage.respondedAt,
      createdAt: mongoMessage.createdAt,
      updatedAt: mongoMessage.updatedAt
    };
  }

  // Email verification methods
  async storeEmailVerificationCode(email: string, code: string, expiry: Date): Promise<void> {
    await this.connect();
    await UserModel.updateOne(
      { email },
      { 
        emailVerificationCode: code,
        emailVerificationExpiry: expiry,
        updatedAt: new Date()
      }
    );
  }

  async verifyEmailCode(email: string, code: string): Promise<boolean> {
    await this.connect();
    const user = await UserModel.findOne({
      email,
      emailVerificationCode: code,
      emailVerificationExpiry: { $gt: new Date() }
    });

    if (user) {
      // Mark email as verified and clear verification data
      await UserModel.updateOne(
        { email },
        {
          isEmailVerified: true,
          emailVerificationCode: null,
          emailVerificationExpiry: null,
          updatedAt: new Date()
        }
      );
      return true;
    }
    return false;
  }

  async clearEmailVerificationCode(email: string): Promise<void> {
    await this.connect();
    await UserModel.updateOne(
      { email },
      {
        emailVerificationCode: null,
        emailVerificationExpiry: null,
        updatedAt: new Date()
      }
    );
  }

  // Create unverified user for email verification flow
  async createUnverifiedUser(data: { 
    email: string; 
    firstName: string; 
    emailVerificationCode: string; 
    emailVerificationExpiry: Date; 
    isEmailVerified: boolean 
  }): Promise<User> {
    await this.connect();
    
    const userData = {
      email: data.email,
      displayName: data.firstName,
      username: data.email.split('@')[0] + '_' + Date.now(), // Generate unique username
      firebaseUid: 'email_' + Date.now() + '_' + Math.random().toString(36).substring(7), // Temporary UID for manual signup
      isEmailVerified: data.isEmailVerified,
      emailVerificationCode: data.emailVerificationCode,
      emailVerificationExpiry: data.emailVerificationExpiry,
      isOnboarded: false,
      credits: 10, // Initial credits for new users
      referralCode: this.generateReferralCode(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const user = new UserModel(userData);
    const savedUser = await user.save();
    return this.convertUser(savedUser);
  }

  // Generate unique referral code
  private generateReferralCode(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  // Email verification helper methods
  async updateUserEmailVerification(id: number | string, token: string, expires: Date): Promise<User> {
    await this.connect();
    
    const user = await UserModel.findByIdAndUpdate(
      id,
      {
        emailVerificationCode: token,
        emailVerificationExpiry: expires,
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!user) {
      throw new Error('User not found');
    }

    return this.convertUser(user);
  }

  // YouTube workspace data update method
  async updateYouTubeWorkspaceData(updates: any): Promise<any> {
    await this.connect();
    
    console.log('[YOUTUBE UPDATE] Updating YouTube accounts with data:', updates);
    
    const result = await SocialAccountModel.updateMany(
      { platform: 'youtube' },
      {
        $set: {
          workspaceId: updates.workspaceId,
          subscriberCount: updates.subscriberCount,
          videoCount: updates.videoCount,
          viewCount: updates.viewCount,
          lastSync: updates.lastSync,
          updatedAt: updates.updatedAt
        }
      }
    );

    console.log('[YOUTUBE UPDATE] Update result:', {
      matched: result.matchedCount,
      modified: result.modifiedCount
    });

    return result;
  }

  async verifyUserEmail(id: number | string, data: { password?: string; firstName?: string; lastName?: string; firebaseUid?: string }): Promise<User> {
    await this.connect();
    
    const updateData: any = {
      isEmailVerified: true,
      emailVerificationCode: null,
      emailVerificationExpiry: null,
      updatedAt: new Date()
    };

    if (data.firstName) updateData.displayName = data.firstName;
    if (data.password) updateData.passwordHash = data.password; // Should be hashed before calling this
    if (data.firebaseUid) updateData.firebaseUid = data.firebaseUid;

    const user = await UserModel.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    );

    if (!user) {
      throw new Error('User not found');
    }

    return this.convertUser(user);
  }

  // THUMBNAIL GENERATION SYSTEM METHODS

  // Thumbnail Projects
  async createThumbnailProject(data: any): Promise<any> {
    await this.connect();
    const result = await this.client.db().collection('thumbnail_projects').insertOne({
      ...data,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    return {
      id: result.insertedId.toString(),
      ...data,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  async getThumbnailProject(projectId: number): Promise<any> {
    await this.connect();
    const project = await this.client.db().collection('thumbnail_projects')
      .findOne({ _id: new ObjectId(projectId.toString()) });
    
    if (!project) return null;
    
    return {
      id: project._id.toString(),
      ...project
    };
  }

  async updateThumbnailProject(projectId: number, updates: any): Promise<void> {
    await this.connect();
    await this.client.db().collection('thumbnail_projects')
      .updateOne(
        { _id: new ObjectId(projectId.toString()) },
        { $set: { ...updates, updatedAt: new Date() } }
      );
  }

  async getThumbnailProjects(workspaceId: number): Promise<any[]> {
    await this.connect();
    const projects = await this.client.db().collection('thumbnail_projects')
      .find({ workspaceId })
      .sort({ createdAt: -1 })
      .toArray();
    
    return projects.map(project => ({
      id: project._id.toString(),
      ...project
    }));
  }

  // Thumbnail Strategies
  async createThumbnailStrategy(data: any): Promise<any> {
    await this.connect();
    const result = await this.client.db().collection('thumbnail_strategies').insertOne({
      ...data,
      createdAt: new Date()
    });
    
    return {
      id: result.insertedId.toString(),
      ...data,
      createdAt: new Date()
    };
  }

  async getThumbnailStrategy(projectId: number): Promise<any> {
    await this.connect();
    const strategy = await this.client.db().collection('thumbnail_strategies')
      .findOne({ projectId: projectId.toString() });
    
    if (!strategy) return null;
    
    return {
      id: strategy._id.toString(),
      ...strategy
    };
  }

  // Thumbnail Variants
  async createThumbnailVariant(data: any): Promise<any> {
    await this.connect();
    const result = await this.client.db().collection('thumbnail_variants').insertOne({
      ...data,
      createdAt: new Date()
    });
    
    return {
      id: result.insertedId.toString(),
      ...data,
      createdAt: new Date()
    };
  }

  async getThumbnailVariant(variantId: number): Promise<any> {
    await this.connect();
    const variant = await this.client.db().collection('thumbnail_variants')
      .findOne({ _id: new ObjectId(variantId.toString()) });
    
    if (!variant) return null;
    
    return {
      id: variant._id.toString(),
      ...variant
    };
  }

  async getThumbnailVariants(projectId: number): Promise<any[]> {
    await this.connect();
    const variants = await this.client.db().collection('thumbnail_variants')
      .find({ projectId: projectId.toString() })
      .sort({ variantNumber: 1 })
      .toArray();
    
    return variants.map(variant => ({
      id: variant._id.toString(),
      ...variant
    }));
  }

  // Canvas Editor Sessions
  async createCanvasEditorSession(data: any): Promise<any> {
    await this.connect();
    const result = await this.client.db().collection('canvas_editor_sessions').insertOne({
      ...data,
      createdAt: new Date(),
      lastSaved: new Date()
    });
    
    return {
      id: result.insertedId.toString(),
      ...data,
      createdAt: new Date(),
      lastSaved: new Date()
    };
  }

  async getCanvasEditorSession(sessionId: number): Promise<any> {
    await this.connect();
    const session = await this.client.db().collection('canvas_editor_sessions')
      .findOne({ _id: new ObjectId(sessionId.toString()) });
    
    if (!session) return null;
    
    return {
      id: session._id.toString(),
      ...session
    };
  }

  async updateCanvasEditorSession(sessionId: number, updates: any): Promise<void> {
    await this.connect();
    await this.client.db().collection('canvas_editor_sessions')
      .updateOne(
        { _id: new ObjectId(sessionId.toString()) },
        { $set: { ...updates, lastSaved: new Date() } }
      );
  }

  // Thumbnail Exports
  async createThumbnailExport(data: any): Promise<any> {
    await this.connect();
    const result = await this.client.db().collection('thumbnail_exports').insertOne({
      ...data,
      createdAt: new Date(),
      downloadCount: 0
    });
    
    return {
      id: result.insertedId.toString(),
      ...data,
      createdAt: new Date(),
      downloadCount: 0
    };
  }

  async getThumbnailExports(sessionId: number): Promise<any[]> {
    await this.connect();
    const exports = await this.client.db().collection('thumbnail_exports')
      .find({ sessionId: sessionId.toString() })
      .sort({ createdAt: -1 })
      .toArray();
    
    return exports.map(exp => ({
      id: exp._id.toString(),
      ...exp
    }));
  }

  async incrementExportDownload(exportId: number): Promise<void> {
    await this.connect();
    await this.client.db().collection('thumbnail_exports')
      .updateOne(
        { _id: new ObjectId(exportId.toString()) },
        { $inc: { downloadCount: 1 } }
      );
  }

  // AI Features CRUD operations
  
  // Creative Brief operations
  async createCreativeBrief(brief: InsertCreativeBrief): Promise<CreativeBrief> {
    await this.connect();
    const newBrief = new CreativeBriefModel(brief);
    const saved = await newBrief.save();
    return this.convertCreativeBrief(saved);
  }

  async getCreativeBrief(id: number): Promise<CreativeBrief | undefined> {
    await this.connect();
    const brief = await CreativeBriefModel.findById(id.toString());
    return brief ? this.convertCreativeBrief(brief) : undefined;
  }

  async getCreativeBriefsByWorkspace(workspaceId: number): Promise<CreativeBrief[]> {
    await this.connect();
    const briefs = await CreativeBriefModel.find({ workspaceId: workspaceId.toString() }).sort({ createdAt: -1 });
    return briefs.map(brief => this.convertCreativeBrief(brief));
  }

  async updateCreativeBrief(id: number, updates: Partial<CreativeBrief>): Promise<CreativeBrief> {
    await this.connect();
    const updated = await CreativeBriefModel.findByIdAndUpdate(
      id.toString(),
      { ...updates, updatedAt: new Date() },
      { new: true }
    );
    if (!updated) throw new Error('Creative brief not found');
    return this.convertCreativeBrief(updated);
  }

  async deleteCreativeBrief(id: number): Promise<void> {
    await this.connect();
    await CreativeBriefModel.findByIdAndDelete(id.toString());
  }

  // Content Repurpose operations
  async createContentRepurpose(repurpose: InsertContentRepurpose): Promise<ContentRepurpose> {
    await this.connect();
    const newRepurpose = new ContentRepurposeModel(repurpose);
    const saved = await newRepurpose.save();
    return this.convertContentRepurpose(saved);
  }

  async getContentRepurpose(id: number): Promise<ContentRepurpose | undefined> {
    await this.connect();
    const repurpose = await ContentRepurposeModel.findById(id.toString());
    return repurpose ? this.convertContentRepurpose(repurpose) : undefined;
  }

  async getContentRepurposesByWorkspace(workspaceId: number): Promise<ContentRepurpose[]> {
    await this.connect();
    const repurposes = await ContentRepurposeModel.find({ workspaceId: workspaceId.toString() }).sort({ createdAt: -1 });
    return repurposes.map(repurpose => this.convertContentRepurpose(repurpose));
  }

  async updateContentRepurpose(id: number, updates: Partial<ContentRepurpose>): Promise<ContentRepurpose> {
    await this.connect();
    const updated = await ContentRepurposeModel.findByIdAndUpdate(
      id.toString(),
      { ...updates, updatedAt: new Date() },
      { new: true }
    );
    if (!updated) throw new Error('Content repurpose not found');
    return this.convertContentRepurpose(updated);
  }

  async deleteContentRepurpose(id: number): Promise<void> {
    await this.connect();
    await ContentRepurposeModel.findByIdAndDelete(id.toString());
  }

  // Competitor Analysis operations
  async createCompetitorAnalysis(analysis: InsertCompetitorAnalysis): Promise<CompetitorAnalysis> {
    await this.connect();
    const newAnalysis = new CompetitorAnalysisModel(analysis);
    const saved = await newAnalysis.save();
    return this.convertCompetitorAnalysis(saved);
  }

  async getCompetitorAnalysis(id: number): Promise<CompetitorAnalysis | undefined> {
    await this.connect();
    const analysis = await CompetitorAnalysisModel.findById(id.toString());
    return analysis ? this.convertCompetitorAnalysis(analysis) : undefined;
  }

  async getCompetitorAnalysesByWorkspace(workspaceId: number): Promise<CompetitorAnalysis[]> {
    await this.connect();
    const analyses = await CompetitorAnalysisModel.find({ workspaceId: workspaceId.toString() }).sort({ createdAt: -1 });
    return analyses.map(analysis => this.convertCompetitorAnalysis(analysis));
  }

  async updateCompetitorAnalysis(id: number, updates: Partial<CompetitorAnalysis>): Promise<CompetitorAnalysis> {
    await this.connect();
    const updated = await CompetitorAnalysisModel.findByIdAndUpdate(
      id.toString(),
      { ...updates, updatedAt: new Date() },
      { new: true }
    );
    if (!updated) throw new Error('Competitor analysis not found');
    return this.convertCompetitorAnalysis(updated);
  }

  async deleteCompetitorAnalysis(id: number): Promise<void> {
    await this.connect();
    await CompetitorAnalysisModel.findByIdAndDelete(id.toString());
  }

  // Conversion helpers for AI features
  private convertCreativeBrief(doc: any): CreativeBrief {
    return {
      id: parseInt(doc._id.toString()),
      workspaceId: parseInt(doc.workspaceId),
      userId: parseInt(doc.userId),
      title: doc.title,
      targetAudience: doc.targetAudience,
      platforms: doc.platforms,
      campaignGoals: doc.campaignGoals,
      tone: doc.tone,
      style: doc.style,
      industry: doc.industry,
      deadline: doc.deadline,
      budget: doc.budget,
      briefContent: doc.briefContent,
      keyMessages: doc.keyMessages,
      contentFormats: doc.contentFormats,
      hashtags: doc.hashtags,
      references: doc.references,
      status: doc.status,
      creditsUsed: doc.creditsUsed,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt
    };
  }

  private convertContentRepurpose(doc: any): ContentRepurpose {
    return {
      id: parseInt(doc._id.toString()),
      workspaceId: parseInt(doc.workspaceId),
      userId: parseInt(doc.userId),
      originalContentId: doc.originalContentId ? parseInt(doc.originalContentId) : null,
      sourceLanguage: doc.sourceLanguage,
      targetLanguage: doc.targetLanguage,
      sourceContent: doc.sourceContent,
      repurposedContent: doc.repurposedContent,
      contentType: doc.contentType,
      culturalAdaptations: doc.culturalAdaptations,
      toneAdjustments: doc.toneAdjustments,
      platform: doc.platform,
      qualityScore: doc.qualityScore,
      isApproved: doc.isApproved,
      creditsUsed: doc.creditsUsed,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt
    };
  }

  private convertCompetitorAnalysis(doc: any): CompetitorAnalysis {
    return {
      id: parseInt(doc._id.toString()),
      workspaceId: parseInt(doc.workspaceId),
      userId: parseInt(doc.userId),
      competitorUsername: doc.competitorUsername,
      platform: doc.platform,
      analysisType: doc.analysisType,
      scrapedData: doc.scrapedData,
      analysisResults: doc.analysisResults,
      topPerformingPosts: doc.topPerformingPosts,
      contentPatterns: doc.contentPatterns,
      hashtags: doc.hashtags,
      postingSchedule: doc.postingSchedule,
      engagementRate: doc.engagementRate,
      growthRate: doc.growthRate,
      recommendations: doc.recommendations,
      competitorScore: doc.competitorScore,
      lastScraped: doc.lastScraped,
      creditsUsed: doc.creditsUsed,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt
    };
  }

  // Feature usage tracking methods
  async getFeatureUsage(userId: number | string): Promise<any[]> {
    await this.connect();
    try {
      const docs = await FeatureUsageModel.find({ userId }).sort({ createdAt: -1 });
      return docs.map(doc => ({
        id: doc._id.toString(),
        userId: doc.userId,
        featureId: doc.featureId,
        usageCount: doc.usageCount,
        lastUsed: doc.lastUsed,
        metadata: doc.metadata,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt
      }));
    } catch (error) {
      console.error('Error fetching feature usage:', error);
      return [];
    }
  }

  async trackFeatureUsage(userId: number | string, featureId: string, usage: any): Promise<void> {
    await this.connect();
    try {
      await FeatureUsageModel.findOneAndUpdate(
        { userId, featureId },
        {
          $inc: { usageCount: 1 },
          $set: { 
            lastUsed: new Date(),
            metadata: usage,
            updatedAt: new Date()
          }
        },
        { upsert: true }
      );
    } catch (error) {
      console.error('Error tracking feature usage:', error);
    }
  }

  // Waitlist Management Methods
  async createWaitlistUser(insertWaitlistUser: InsertWaitlistUser): Promise<WaitlistUser> {
    await this.connect();
    
    // Generate unique referral code
    const referralCode = this.generateReferralCode();
    
    // Check if referred by someone
    let referredByUserId = null;
    if (insertWaitlistUser.referredBy) {
      const referrer = await WaitlistUserModel.findOne({ 
        referralCode: insertWaitlistUser.referredBy 
      });
      if (referrer) {
        referredByUserId = referrer._id;
        // Increment referrer's count
        await WaitlistUserModel.findByIdAndUpdate(
          referrer._id,
          { $inc: { referralCount: 1 } }
        );
      }
    }
    
    const waitlistUser = new WaitlistUserModel({
      ...insertWaitlistUser,
      referralCode,
      referredBy: referredByUserId,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    const savedUser = await waitlistUser.save();
    return this.convertWaitlistUser(savedUser);
  }

  async getWaitlistUser(id: number | string): Promise<WaitlistUser | undefined> {
    await this.connect();
    
    let query;
    if (typeof id === 'string' && id.length === 24) {
      query = { _id: id };
    } else {
      query = { $or: [{ id: id }, { _id: id.toString() }] };
    }
    
    const user = await WaitlistUserModel.findOne(query);
    return user ? this.convertWaitlistUser(user) : undefined;
  }

  async getWaitlistUserByEmail(email: string): Promise<WaitlistUser | undefined> {
    await this.connect();
    const user = await WaitlistUserModel.findOne({ email });
    return user ? this.convertWaitlistUser(user) : undefined;
  }

  async getWaitlistUserByReferralCode(referralCode: string): Promise<WaitlistUser | undefined> {
    await this.connect();
    const user = await WaitlistUserModel.findOne({ referralCode });
    return user ? this.convertWaitlistUser(user) : undefined;
  }

  async updateWaitlistUser(id: number | string, updates: Partial<WaitlistUser>): Promise<WaitlistUser> {
    await this.connect();
    
    let user;
    if (typeof id === 'string' && id.length === 24) {
      user = await WaitlistUserModel.findByIdAndUpdate(
        id,
        { ...updates, updatedAt: new Date() },
        { new: true }
      );
    } else {
      user = await WaitlistUserModel.findOneAndUpdate(
        { _id: id },
        { ...updates, updatedAt: new Date() },
        { new: true }
      );
    }
    
    if (!user) throw new Error('Waitlist user not found');
    return this.convertWaitlistUser(user);
  }

  async getAllWaitlistUsers(): Promise<WaitlistUser[]> {
    await this.connect();
    const users = await WaitlistUserModel.find({}).sort({ createdAt: -1 });
    return users.map(user => this.convertWaitlistUser(user));
  }

  async getWaitlistStats(): Promise<{ 
    totalUsers: number; 
    todaySignups: number; 
    totalReferrals: number; 
    averageReferrals: number;
    statusBreakdown: { [key: string]: number };
  }> {
    await this.connect();
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const [total, todayCount, pipeline] = await Promise.all([
      WaitlistUserModel.countDocuments(),
      WaitlistUserModel.countDocuments({ createdAt: { $gte: today } }),
      WaitlistUserModel.aggregate([
        {
          $group: {
            _id: null,
            totalReferrals: { $sum: '$referralCount' },
            avgReferrals: { $avg: '$referralCount' }
          }
        }
      ])
    ]);
    
    const statusBreakdown = await WaitlistUserModel.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);
    
    const statusMap = statusBreakdown.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {} as { [key: string]: number });
    
    return {
      totalUsers: total,
      todaySignups: todayCount,
      totalReferrals: pipeline[0]?.totalReferrals || 0,
      averageReferrals: pipeline[0]?.avgReferrals || 0,
      statusBreakdown: statusMap
    };
  }

  async promoteWaitlistUser(id: number | string): Promise<{ 
    user: User; 
    workspace: Workspace; 
    discountCode: string;
    trialDays: number;
  }> {
    await this.connect();
    
    const waitlistUser = await this.getWaitlistUser(id);
    if (!waitlistUser) {
      throw new Error('Waitlist user not found');
    }
    
    // Generate discount code (50% off first month)
    const discountCode = `EARLY50_${Date.now().toString(36).toUpperCase()}`;
    const discountExpiry = new Date();
    discountExpiry.setDate(discountExpiry.getDate() + 30); // 30 days to use discount
    
    // Calculate trial period (14 days + 1 day per referral, max 30 days)
    const trialDays = Math.min(14 + waitlistUser.referralCount, 30);
    const trialExpiry = new Date();
    trialExpiry.setDate(trialExpiry.getDate() + trialDays);
    
    // Create regular user account
    const user = await this.createUser({
      email: waitlistUser.email,
      username: waitlistUser.name.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now(),
      displayName: waitlistUser.name,
      credits: 100 + (waitlistUser.referralCount * 20), // 100 base + 20 per referral
      plan: 'Free',
      referredBy: waitlistUser.referredBy,
      isEmailVerified: true,
      status: 'early_access',
      trialExpiresAt: trialExpiry,
      discountCode,
      discountExpiresAt: discountExpiry,
      hasUsedWaitlistBonus: false
    });
    
    // Get or create default workspace
    let workspace = await this.getDefaultWorkspace(user.id);
    if (!workspace) {
      workspace = await this.createWorkspace({
        name: `${waitlistUser.name}'s Workspace`,
        description: 'Early access workspace',
        userId: user.id,
        theme: 'space',
        isDefault: true,
        credits: 50 // Additional workspace credits
      });
    }
    
    // Update waitlist user status
    await this.updateWaitlistUser(id, {
      status: 'early_access'
    });
    
    return {
      user,
      workspace,
      discountCode,
      trialDays
    };
  }

  private convertWaitlistUser(mongoUser: any): WaitlistUser {
    return {
      id: mongoUser._id.toString(),
      name: mongoUser.name,
      email: mongoUser.email,
      referralCode: mongoUser.referralCode,
      referredBy: mongoUser.referredBy,
      referralCount: mongoUser.referralCount || 0,
      credits: mongoUser.credits || 0,
      status: mongoUser.status || 'waitlisted',
      discountCode: mongoUser.discountCode,
      discountExpiresAt: mongoUser.discountExpiresAt,
      dailyLogins: mongoUser.dailyLogins || 0,
      feedbackSubmitted: mongoUser.feedbackSubmitted || false,
      joinedAt: mongoUser.joinedAt || mongoUser.createdAt,
      createdAt: mongoUser.createdAt,
      updatedAt: mongoUser.updatedAt,
      metadata: mongoUser.metadata || {}
    };
  }

  // Database reset methods for fresh starts
  async clearAllUsers(): Promise<number> {
    await this.connect();
    const result = await UserModel.deleteMany({});
    return result.deletedCount || 0;
  }

  async clearAllWaitlistUsers(): Promise<number> {
    await this.connect();
    const result = await WaitlistUserModel.deleteMany({});
    return result.deletedCount || 0;
  }

  async deleteWaitlistUser(id: number | string): Promise<void> {
    await this.connect();
    const objectId = typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id;
    const result = await WaitlistUserModel.findByIdAndDelete(objectId);
    if (!result) {
      throw new Error('Waitlist user not found');
    }
  }

  async clearAllWorkspaces(): Promise<number> {
    await this.connect();
    const result = await WorkspaceModel.deleteMany({});
    return result.deletedCount || 0;
  }

  async clearAllSocialAccounts(): Promise<number> {
    await this.connect();
    const result = await SocialAccountModel.deleteMany({});
    return result.deletedCount || 0;
  }

  async clearAllContent(): Promise<number> {
    await this.connect();
    const result = await ContentModel.deleteMany({});
    return result.deletedCount || 0;
  }

  // VeeGPT Chat Methods
  async getChatConversations(userId: string, workspaceId?: string): Promise<ChatConversation[]> {
    await this.connect();
    const query: any = { userId };
    if (workspaceId) {
      query.workspaceId = workspaceId;
    }
    const conversations = await ChatConversationModel.find(query)
      .sort({ updatedAt: -1 });
    return conversations.map(doc => ({
      id: doc.id, // Use the stored numeric ID
      userId: doc.userId,
      workspaceId: doc.workspaceId,
      title: doc.title,
      messageCount: doc.messageCount,
      lastMessageAt: doc.lastMessageAt,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt
    }));
  }

  async createChatConversation(conversation: InsertChatConversation): Promise<ChatConversation> {
    await this.connect();
    
    // Generate a unique numeric ID based on timestamp and random component
    const numericId = Date.now() % 1000000000 + Math.floor(Math.random() * 1000);
    
    const doc = new ChatConversationModel({
      ...conversation,
      id: numericId,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    const saved = await doc.save();
    return {
      id: saved.id,
      userId: saved.userId,
      workspaceId: saved.workspaceId,
      title: saved.title,
      messageCount: saved.messageCount,
      lastMessageAt: saved.lastMessageAt,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt
    };
  }

  async getChatMessages(conversationId: number): Promise<ChatMessage[]> {
    await this.connect();
    const messages = await ChatMessageModel.find({ conversationId })
      .sort({ createdAt: 1 });
    return messages.map(doc => ({
      id: doc.id, // Use the stored numeric ID
      conversationId: doc.conversationId,
      role: doc.role,
      content: doc.content,
      tokensUsed: doc.tokensUsed,
      createdAt: doc.createdAt
    }));
  }

  async createChatMessage(message: InsertChatMessage): Promise<ChatMessage> {
    await this.connect();
    
    // Generate a unique numeric ID
    const numericId = Date.now() % 1000000000 + Math.floor(Math.random() * 1000);
    
    const doc = new ChatMessageModel({
      ...message,
      id: numericId,
      createdAt: new Date()
    });
    const saved = await doc.save();
    return {
      id: saved.id,
      conversationId: saved.conversationId,
      role: saved.role,
      content: saved.content,
      tokensUsed: saved.tokensUsed,
      createdAt: saved.createdAt
    };
  }

  async updateChatMessage(id: number, updates: Partial<ChatMessage>): Promise<ChatMessage> {
    await this.connect();
    const updated = await ChatMessageModel.findOneAndUpdate(
      { id: id },
      { ...updates },
      { new: true }
    );
    if (!updated) throw new Error('Message not found');
    return {
      id: updated.id,
      conversationId: updated.conversationId,
      role: updated.role,
      content: updated.content,
      tokensUsed: updated.tokensUsed,
      createdAt: updated.createdAt
    };
  }

  async updateChatConversation(id: string | number, updates: Partial<ChatConversation>): Promise<ChatConversation> {
    await this.connect();
    const updated = await ChatConversationModel.findOneAndUpdate(
      { id: id },
      { ...updates, updatedAt: new Date() },
      { new: true }
    );
    if (!updated) throw new Error('Conversation not found');
    return {
      id: updated.id,
      userId: updated.userId,
      workspaceId: updated.workspaceId,
      title: updated.title,
      messageCount: updated.messageCount,
      lastMessageAt: updated.lastMessageAt,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt
    };
  }

  async deleteChatConversation(id: string | number): Promise<void> {
    await this.connect();
    // Delete all messages in the conversation first
    await ChatMessageModel.deleteMany({ conversationId: id });
    // Delete the conversation
    await ChatConversationModel.findOneAndDelete({ id: id });
  }
}

// Export singleton instance
export const storage = new MongoStorage();

// Export models for direct access
export { UserModel, WorkspaceModel, SocialAccountModel };
