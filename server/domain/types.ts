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
  hasClaimedWelcomeBonus: boolean;
  welcomeBonusClaimedAt?: Date;
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
  planStatus: string;
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
  aiConfiguration?: {
    aiModel?: string;
    creativityLevel?: number;
    optimizationGoals?: string;
    aiPersona?: string;
    captionStyle?: string;
    responseLength?: string;
    multilingual?: string;
    videoEngine?: string;
    thumbnailStyle?: string;
    autoHashtags?: boolean;
    contentSafety?: string;
    aiMemory?: string;
    autoLearning?: boolean;
    googleAiStudioKey?: string;
    openAiKey?: string;
  };
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
  aiConfiguration?: {
    aiModel?: string;
    creativityLevel?: number;
    optimizationGoals?: string;
    aiPersona?: string;
    captionStyle?: string;
    responseLength?: string;
    multilingual?: string;
    videoEngine?: string;
    thumbnailStyle?: string;
    autoHashtags?: boolean;
    contentSafety?: string;
    aiMemory?: string;
    autoLearning?: boolean;
    googleAiStudioKey?: string;
    openAiKey?: string;
  };
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
  totalImpressions?: number;
  avgEngagement?: number;
  postsAnalyzed?: number;
  accountLevelReach?: number;
  postLevelReach?: number;
  reachSource?: string;
  reachByPeriod?: any;
  totalShares?: number;
  totalSaves?: number;
  audienceCity?: Record<string, number>;
  audienceCountry?: Record<string, number>;
  audienceGenderAge?: Record<string, number>;
  audienceActiveTime?: Record<string, number>;
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
  accountType?: string;
  followersCount?: number;
  mediaCount?: number;
  isBusinessAccount?: boolean;
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

export interface WaitlistUser {
  id: string;
  name?: string;
  email: string;
  referralCode?: string;
  referredBy?: string;
  referralCount: number;
  credits: number;
  status: string;
  discountCode?: string;
  discountExpiresAt?: Date;
  dailyLogins: number;
  feedbackSubmitted: boolean;
  joinedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  metadata: Record<string, any>;
}

export interface InsertWaitlistUser {
  name?: string;
  email: string;
  referralCode?: string;
  referredBy?: string;
  status?: string;
  metadata?: Record<string, any>;
}

export interface Suggestion {
  id: string;
  workspaceId: string;
  type: string;
  data: any;
  confidence: number;
  isUsed: boolean;
  validUntil?: Date;
  createdAt: Date;
}

export interface InsertSuggestion {
  workspaceId: string;
  type: string;
  data: any;
  confidence?: number;
}

export interface Referral {
  id: string;
  referrerId: string;
  referredId: string;
  code: string;
  status: string;
  rewardAmount: number;
  createdAt: Date;
}

export interface InsertReferral {
  referrerId: string;
  referredId: string;
  code: string;
  rewardAmount?: number;
}

export interface Addon {
  id: string;
  userId: string;
  type: string;
  name: string;
  price: number;
  isActive: boolean;
  expiresAt?: Date;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertAddon {
  userId: string;
  type: string;
  name: string;
  price: number;
  metadata?: Record<string, any>;
}

export interface ContentRecommendation {
  id: string;
  workspaceId: string;
  type: string;
  title: string;
  description?: string;
  duration?: number;
  category: string;
  country: string;
  tags: string[];
  engagement: any;
  thumbnailUrl?: string;
  mediaUrl?: string;
  sourceUrl?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertContentRecommendation {
  workspaceId: string;
  type: string;
  title: string;
  category: string;
  country: string;
}

export interface UserContentHistory {
  id: string;
  userId: string;
  workspaceId: string;
  action: string;
  recommendationId?: string;
  metadata: Record<string, any>;
  createdAt: Date;
}

export interface InsertUserContentHistory {
  userId: string;
  workspaceId: string;
  action: string;
  recommendationId?: string;
}

export interface Admin {
  id: string;
  email: string;
  username: string;
  password?: string;
  role: string;
  isActive: boolean;
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertAdmin {
  email: string;
  username: string;
  password?: string;
  role?: string;
}

export interface AdminSession {
  id: string;
  adminId: string;
  token: string;
  ipAddress?: string;
  userAgent?: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface InsertAdminSession {
  adminId: string;
  token: string;
  expiresAt: Date;
}

export interface Popup {
  id: string;
  title: string;
  content: string;
  type: string;
  priority: number;
  isActive: boolean;
  targetUserType?: string;
  displayConditions?: any;
  actionButton?: any;
  startDate?: Date;
  endDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertPopup {
  title: string;
  content: string;
  type: string;
  priority?: number;
  isActive?: boolean;
}


export interface AppSetting {
  id: string;
  key: string;
  value: any;
  description?: string;
  category: string;
  isPublic: boolean;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertAppSetting {
  key: string;
  value: any;
  description?: string;
  category: string;
  isPublic?: boolean;
}

// ============================================================================
// FEEDBACK TYPES
// ============================================================================
export interface FeedbackMessage {
  id: string;
  userId?: string;
  subject: string;
  message: string;
  type: string;
  status: string;
  adminResponse?: string;
  respondedBy?: string;
  respondedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertFeedbackMessage {
  subject: string;
  message: string;
  type: string;
  userId?: string;
  name?: string;
  email?: string;
}

// ============================================================================
// THUMBNAIL TYPES
// ============================================================================
export interface ThumbnailProject {
  id: string;
  userId: string;
  workspaceId: string;
  title: string;
  description?: string;
  category?: string;
  uploadedImageUrl?: string;
  status: string;
  stage: number;
  creditsUsed: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertThumbnailProject {
  userId: string;
  workspaceId: string;
  title: string;
  description?: string;
  category?: string;
  uploadedImageUrl?: string;
  status?: string;
  stage?: number;
}

export interface ThumbnailStrategy {
  id: string;
  projectId: string;
  titles?: any;
  ctas?: any;
  fonts?: any;
  colors?: any;
  style?: string;
  emotion?: string;
  hooks?: any;
  placement?: any;
  createdAt: Date;
}

export interface InsertThumbnailStrategy {
  projectId: string;
  titles?: any;
  ctas?: any;
  fonts?: any;
  colors?: any;
  style?: string;
  emotion?: string;
  hooks?: any;
  placement?: any;
}

export interface ThumbnailVariant {
  id: string;
  projectId: string;
  variantNumber: number;
  layoutType: string;
  previewUrl: string;
  layerMetadata?: any;
  layoutClassification?: string;
  predictedCtr?: number;
  composition?: any;
  createdAt: Date;
}

export interface InsertThumbnailVariant {
  projectId: string;
  variantNumber: number;
  layoutType: string;
  previewUrl: string;
  layerMetadata?: any;
  layoutClassification?: string;
  predictedCtr?: number;
  composition?: any;
}

export interface CanvasEditorSession {
  id: string;
  variantId: string;
  userId: string;
  canvasData?: any;
  layers?: any;
  editHistory?: any;
  lastSaved?: Date;
  isActive: boolean;
  createdAt: Date;
}

export interface InsertCanvasEditorSession {
  variantId: string;
  userId: string;
  canvasData?: any;
  layers?: any;
  editHistory?: any;
  isActive?: boolean;
}

export interface ThumbnailExport {
  id: string;
  sessionId: string;
  format: string;
  exportUrl: string;
  downloadCount: number;
  cloudStorageUrl?: string;
  metadata?: any;
  createdAt: Date;
}

export interface InsertThumbnailExport {
  sessionId: string;
  format: string;
  exportUrl: string;
  cloudStorageUrl?: string;
  metadata?: any;
}

// ============================================================================
// CREATIVE BRIEF & REPURPOSE TYPES
// ============================================================================
export interface CreativeBrief {
  id: string;
  workspaceId: string;
  userId: string;
  title: string;
  targetAudience: string;
  platforms: any;
  campaignGoals: any;
  tone: string;
  style: string;
  industry: string;
  deadline?: Date;
  budget?: number;
  briefContent: string;
  keyMessages?: any;
  contentFormats?: any;
  hashtags?: any;
  references?: any;
  status: string;
  creditsUsed: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertCreativeBrief {
  workspaceId: string;
  userId: string;
  title: string;
  targetAudience: string;
  platforms: any;
  campaignGoals: any;
  tone: string;
  style: string;
  industry: string;
  briefContent: string;
}

export interface ContentRepurpose {
  id: string;
  workspaceId: string;
  userId: string;
  originalContentId?: string;
  sourceLanguage: string;
  targetLanguage: string;
  sourceContent: string;
  repurposedContent: string;
  contentType: string;
  culturalAdaptations?: any;
  toneAdjustments?: any;
  platform: string;
  qualityScore?: number;
  isApproved: boolean;
  creditsUsed: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertContentRepurpose {
  workspaceId: string;
  userId: string;
  sourceLanguage: string;
  targetLanguage: string;
  sourceContent: string;
  repurposedContent: string;
  contentType: string;
  platform: string;
}

// ============================================================================
// COMPETITOR ANALYSIS TYPES
// ============================================================================
export interface CompetitorAnalysis {
  id: string;
  workspaceId: string;
  userId: string;
  competitorUsername: string;
  platform: string;
  analysisType: string;
  scrapedData: any;
  analysisResults: any;
  topPerformingPosts?: any;
  contentPatterns?: any;
  hashtags?: any;
  postingSchedule?: any;
  engagementRate?: number;
  growthRate?: number;
  recommendations: string;
  competitorScore?: number;
  lastScraped?: Date;
  creditsUsed: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertCompetitorAnalysis {
  workspaceId: string;
  userId: string;
  competitorUsername: string;
  platform: string;
  analysisType: string;
  recommendations: string;
}

// ============================================================================
// DM TYPES
// ============================================================================
export interface DmConversation {
  id: string;
  workspaceId: string;
  platform: string;
  participantId: string;
  participantUsername: string;
  lastMessageAt: Date;
  messageCount: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertDmConversation {
  workspaceId: string;
  platform: string;
  participantId: string;
  participantUsername: string;
}

export interface DmMessage {
  id: string;
  conversationId: string;
  messageId: string;
  sender: 'user' | 'participant' | 'ai';
  content: string;
  messageType: string;
  sentiment?: string;
  topics?: string[];
  aiResponse?: string;
  automationRuleId?: string;
  createdAt: Date;
}

export interface InsertDmMessage {
  conversationId: string;
  messageId: string;
  sender: 'user' | 'participant' | 'ai';
  content: string;
  messageType?: string;
}

// ============================================================================
// CHAT TYPES (continued)
// ============================================================================
export interface ChatConversation {
  id: string;
  userId: string;
  workspaceId?: string;
  title: string;
  lastMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertChatConversation {
  userId: string;
  workspaceId?: string;
  title: string;
  lastMessageAt?: Date;
}

export interface InsertChatMessage {
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: Record<string, any>;
}

// ============================================================================
// CONVERSATION CONTEXT TYPES
// ============================================================================
export interface ConversationContext {
  id: string;
  conversationId: string;
  contextType: string;
  contextValue: string;
  confidence: number;
  source: string;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertConversationContext {
  conversationId: string;
  contextType: string;
  contextValue: string;
  confidence?: number;
  expiresAt?: Date;
}

// ============================================================================
// VIRAL PATTERN TYPES
// ============================================================================
export interface ViralPattern {
  id: string;
  
  // Pattern Details
  name: string;                    // e.g., "Story-Insight-Question"
  category: 'hook' | 'structure' | 'engagement' | 'storytelling';
  pattern: string;                 // Template with placeholders
  description: string;
  
  // Targeting
  niches: string[];               // fitness, food, travel, etc.
  postTypes: ('post' | 'story' | 'reel')[];
  
  // Performance
  avgEngagementRate: number;      // Historical average
  usageCount: number;             // How many times used
  successRate: number;            // % of times it performed well
  
  // Examples
  exampleCaptions: string[];      // Real captions using this pattern
  
  // Metadata
  trending: boolean;              // Currently trending
  lastUsed?: Date;
  createdAt: Date;
}

export interface InsertViralPattern {
  name: string;
  category: 'hook' | 'structure' | 'engagement' | 'storytelling';
  pattern: string;
  description: string;
  niches: string[];
  postTypes: ('post' | 'story' | 'reel')[];
  avgEngagementRate?: number;
  usageCount?: number;
  successRate?: number;
  exampleCaptions?: string[];
  trending?: boolean;
}

export interface ViralHook {
  id: string;
  hookText: string;               // e.g., "Hot take:", "POV:"
  niche: string;
  avgEngagementBoost: number;     // % increase in engagement
  usageCount: number;
  createdAt: Date;
}

export interface InsertViralHook {
  hookText: string;
  niche: string;
  avgEngagementBoost?: number;
  usageCount?: number;
}

// ============================================================================
// AUTHENTIC INSTAGRAM CAPTION GENERATION TYPES
// ============================================================================

// Niche Context Types
export interface NicheContext {
  id: string;
  niche: string;
  
  // Language
  vocabulary: string[];
  slangTerms: Record<string, string>;
  culturalReferences: string[];
  
  // Trends (last 30 days)
  trendingTopics: string[];
  trendingHashtags: string[];
  trendingPhrases: string[];
  
  // Style
  typicalEmojis: string[];
  toneGuidelines: string;
  
  // Metadata
  lastUpdated: Date;
}

// Hashtag Performance Types
export interface HashtagPerformance {
  id: string;
  hashtag: string;
  niche: string;
  
  // Usage tracking
  usageCount: number;
  lastUsedAt: Date;
  
  // Performance metrics (aggregated)
  totalImpressions: number;
  totalReach: number;
  totalLikes: number;
  totalComments: number;
  totalSaves: number;
  totalShares: number;
  
  // Calculated metrics
  avgEngagementRate: number;
  avgDiscoverability: number;
  avgRankingPosition: number;
  
  // Competition estimate
  estimatedCompetition: 'high' | 'medium' | 'low';
  estimatedPostCount: number;
  
  // Performance by post type
  performanceByType: {
    post: {
      count: number;
      avgEngagementRate: number;
    };
    story: {
      count: number;
      avgEngagementRate: number;
    };
    reel: {
      count: number;
      avgEngagementRate: number;
    };
  };
  
  // Individual usage records
  usageHistory: Array<{
    postId: string;
    postType: 'post' | 'story' | 'reel';
    impressions: number;
    reach: number;
    engagementRate: number;
    recordedAt: Date;
  }>;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertNicheContext {
  niche: string;
  vocabulary?: string[];
  slangTerms?: Record<string, string>;
  culturalReferences?: string[];
  trendingTopics?: string[];
  trendingHashtags?: string[];
  trendingPhrases?: string[];
  typicalEmojis?: string[];
  toneGuidelines?: string;
}

// ============================================================================
// EXAMPLE CAPTION TYPES
// ============================================================================
export interface ExampleCaption {
  id: string;
  caption: string;
  
  // Source
  source: 'user' | 'curated' | 'scraped';
  sourceAccount?: string;
  userId?: string;
  
  // Classification
  niche: string;
  postType: 'post' | 'story' | 'reel';
  style: string;
  
  // Performance
  engagementRate: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
  
  // Characteristics
  captionLength: number;
  hookType: string;
  hasQuestion: boolean;
  hasEmoji: boolean;
  emojiCount: number;
  
  // Metadata
  capturedAt: Date;
  verified: boolean;
}

export interface InsertExampleCaption {
  caption: string;
  source: 'user' | 'curated' | 'scraped';
  sourceAccount?: string;
  userId?: string;
  niche: string;
  postType: 'post' | 'story' | 'reel';
  style: string;
  engagementRate: number;
  likes?: number;
  comments?: number;
  saves?: number;
  shares?: number;
  captionLength: number;
  hookType?: string;
  hasQuestion?: boolean;
  hasEmoji?: boolean;
  emojiCount?: number;
  verified?: boolean;
}

// ============================================================================
// ENGAGEMENT PREDICTION TYPES
// ============================================================================
export interface EngagementPrediction {
  // Predicted Rates
  predictedLikeRate: number;     // %
  predictedCommentRate: number;  // %
  predictedSaveRate: number;     // %
  predictedShareRate: number;    // %
  
  // Confidence
  confidence: number;  // 0-1
  
  // Contributing Factors
  factors: {
    hookStrength: number;        // 0-10
    readabilityScore: number;    // 0-10
    ctaClarity: number;          // 0-10
    emotionalResonance: number;  // 0-10
    lengthOptimality: number;    // 0-10
    trendingTopicBonus: number;  // 0-10
  };
  
  // Comparison
  vsUserAverage: number;  // % difference from user's avg
  
  // Performance Flag (Requirements 9.3, 9.6)
  performanceFlag?: {
    isBelowAverage: boolean;
    severity: 'none' | 'minor' | 'moderate' | 'major';
    suggestions: string[];
    weakestFactors: Array<{ factor: string; score: number; suggestion: string }>;
  };
}

export interface UserAverageMetrics {
  avgLikeRate: number;
  avgCommentRate: number;
  avgSaveRate: number;
  avgShareRate: number;
}

export interface ActualPerformanceMetrics {
  likes: number;
  comments: number;
  saves: number;
  shares: number;
  impressions: number;
}
