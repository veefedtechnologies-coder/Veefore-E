import { z } from "zod";

// ============================================================================
// USER SCHEMA
// ============================================================================
export const userSchema = z.object({
  id: z.number(),
  firebaseUid: z.string(),
  email: z.string(),
  username: z.string(),
  displayName: z.string().nullable().optional(),
  avatar: z.string().nullable().optional(),
  credits: z.number().optional().default(50),
  plan: z.string().optional().default("free"),
  planStatus: z.string().optional().default("active"),
  stripeCustomerId: z.string().nullable().optional(),
  stripeSubscriptionId: z.string().nullable().optional(),
  referralCode: z.string().nullable().optional(),
  referredBy: z.string().nullable().optional(),
  totalReferrals: z.number().optional().default(0),
  totalEarned: z.number().optional().default(0),
  isOnboarded: z.boolean().optional().default(false),
  status: z.string().optional().default("waitlisted"),
  trialExpiresAt: z.date().nullable().optional(),
  discountCode: z.string().nullable().optional(),
  discountExpiresAt: z.date().nullable().optional(),
  hasUsedWaitlistBonus: z.boolean().optional().default(false),
  hasClaimedWelcomeBonus: z.boolean().optional().default(false),
  welcomeBonusClaimedAt: z.date().nullable().optional(),
  dailyLoginStreak: z.number().optional().default(0),
  lastLoginAt: z.date().nullable().optional(),
  feedbackSubmittedAt: z.date().nullable().optional(),
  isEmailVerified: z.boolean().optional().default(false),
  emailVerificationCode: z.string().nullable().optional(),
  emailVerificationExpiry: z.date().nullable().optional(),
  onboardingStep: z.number().optional().default(1),
  onboardingData: z.any().nullable().optional(),
  preferences: z.any().nullable().optional(),
  goals: z.any().nullable().optional(),
  niche: z.string().nullable().optional(),
  targetAudience: z.string().nullable().optional(),
  contentStyle: z.string().nullable().optional(),
  postingFrequency: z.string().nullable().optional(),
  socialPlatforms: z.any().nullable().optional(),
  businessType: z.string().nullable().optional(),
  experienceLevel: z.string().nullable().optional(),
  primaryObjective: z.string().nullable().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

export const insertUserSchema = z.object({
  firebaseUid: z.string(),
  email: z.string(),
  username: z.string(),
  displayName: z.string().optional(),
  avatar: z.string().optional(),
  referredBy: z.string().optional()
});

export type User = z.infer<typeof userSchema>;
export type InsertUser = z.infer<typeof insertUserSchema>;

// ============================================================================
// WORKSPACE SCHEMA
// ============================================================================
export const workspaceSchema = z.object({
  id: z.number(),
  userId: z.number(),
  name: z.string(),
  description: z.string().nullable().optional(),
  avatar: z.string().nullable().optional(),
  theme: z.string().optional().default("default"),
  aiPersonality: z.string().nullable().optional(),
  credits: z.number().optional().default(0),
  isDefault: z.boolean().optional().default(false),
  maxTeamMembers: z.number().optional().default(1),
  inviteCode: z.string().nullable().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

export const insertWorkspaceSchema = z.object({
  userId: z.number(),
  name: z.string(),
  description: z.string().optional(),
  avatar: z.string().optional(),
  theme: z.string().optional(),
  aiPersonality: z.string().optional(),
  isDefault: z.boolean().optional()
});

export type Workspace = z.infer<typeof workspaceSchema>;
export type InsertWorkspace = z.infer<typeof insertWorkspaceSchema>;

// ============================================================================
// WORKSPACE MEMBER SCHEMA
// ============================================================================
export const workspaceMemberSchema = z.object({
  id: z.number(),
  workspaceId: z.number(),
  userId: z.number(),
  role: z.string(),
  permissions: z.any().nullable().optional(),
  invitedBy: z.number().nullable().optional(),
  joinedAt: z.date().optional(),
  status: z.string().optional().default("active"),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

export const insertWorkspaceMemberSchema = z.object({
  workspaceId: z.number(),
  userId: z.number(),
  role: z.string(),
  permissions: z.any().optional(),
  invitedBy: z.number().optional()
});

export type WorkspaceMember = z.infer<typeof workspaceMemberSchema>;
export type InsertWorkspaceMember = z.infer<typeof insertWorkspaceMemberSchema>;

// ============================================================================
// TEAM INVITATION SCHEMA
// ============================================================================
export const teamInvitationSchema = z.object({
  id: z.number(),
  workspaceId: z.number(),
  invitedBy: z.number(),
  email: z.string(),
  role: z.string(),
  permissions: z.any().nullable().optional(),
  token: z.string(),
  expiresAt: z.date(),
  status: z.string().optional().default("pending"),
  acceptedAt: z.date().nullable().optional(),
  createdAt: z.date().optional()
});

export const insertTeamInvitationSchema = z.object({
  workspaceId: z.number(),
  invitedBy: z.number(),
  email: z.string(),
  role: z.string(),
  permissions: z.any().optional(),
  token: z.string(),
  expiresAt: z.date()
});

export type TeamInvitation = z.infer<typeof teamInvitationSchema>;
export type InsertTeamInvitation = z.infer<typeof insertTeamInvitationSchema>;

// ============================================================================
// SOCIAL ACCOUNT SCHEMA
// ============================================================================
export const socialAccountSchema = z.object({
  id: z.number(),
  workspaceId: z.number(),
  platform: z.string(),
  accountId: z.string(),
  username: z.string(),
  accessToken: z.string(),
  refreshToken: z.string().nullable().optional(),
  expiresAt: z.date().nullable().optional(),
  isActive: z.boolean().optional().default(true),
  followersCount: z.number().nullable().optional(),
  followingCount: z.number().nullable().optional(),
  mediaCount: z.number().nullable().optional(),
  biography: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  profilePictureUrl: z.string().nullable().optional(),
  subscriberCount: z.number().nullable().optional(),
  videoCount: z.number().nullable().optional(),
  viewCount: z.number().nullable().optional(),
  channelDescription: z.string().nullable().optional(),
  channelThumbnail: z.string().nullable().optional(),
  accountType: z.string().nullable().optional(),
  isBusinessAccount: z.boolean().optional().default(false),
  isVerified: z.boolean().optional().default(false),
  totalLikes: z.number().optional().default(0),
  totalComments: z.number().optional().default(0),
  totalShares: z.number().optional().default(0),
  totalSaves: z.number().optional().default(0),
  totalReach: z.number().optional().default(0),
  totalImpressions: z.number().optional().default(0),
  avgEngagement: z.number().optional().default(0),
  lastSyncAt: z.date().nullable().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

export const insertSocialAccountSchema = z.object({
  workspaceId: z.number(),
  platform: z.string(),
  accountId: z.string(),
  username: z.string(),
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  expiresAt: z.date().optional()
});

export type SocialAccount = z.infer<typeof socialAccountSchema>;
export type InsertSocialAccount = z.infer<typeof insertSocialAccountSchema>;

// ============================================================================
// CREATIVE BRIEF SCHEMA
// ============================================================================
export const creativeBriefSchema = z.object({
  id: z.number(),
  workspaceId: z.number(),
  userId: z.number(),
  title: z.string(),
  targetAudience: z.string(),
  platforms: z.any(),
  campaignGoals: z.any(),
  tone: z.string(),
  style: z.string(),
  industry: z.string(),
  deadline: z.date().nullable().optional(),
  budget: z.number().nullable().optional(),
  briefContent: z.string(),
  keyMessages: z.any().nullable().optional(),
  contentFormats: z.any().nullable().optional(),
  hashtags: z.any().nullable().optional(),
  references: z.any().nullable().optional(),
  status: z.string().optional().default("draft"),
  creditsUsed: z.number().optional().default(5),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

export const insertCreativeBriefSchema = creativeBriefSchema.omit({ id: true, createdAt: true, updatedAt: true }).partial({
  deadline: true,
  budget: true,
  keyMessages: true,
  contentFormats: true,
  hashtags: true,
  references: true,
  status: true,
  creditsUsed: true
});

export type CreativeBrief = z.infer<typeof creativeBriefSchema>;
export type InsertCreativeBrief = z.infer<typeof insertCreativeBriefSchema>;

// ============================================================================
// CONTENT REPURPOSE SCHEMA
// ============================================================================
export const contentRepurposeSchema = z.object({
  id: z.number(),
  workspaceId: z.number(),
  userId: z.number(),
  originalContentId: z.number().nullable().optional(),
  sourceLanguage: z.string(),
  targetLanguage: z.string(),
  sourceContent: z.string(),
  repurposedContent: z.string(),
  contentType: z.string(),
  culturalAdaptations: z.any().nullable().optional(),
  toneAdjustments: z.any().nullable().optional(),
  platform: z.string(),
  qualityScore: z.number().nullable().optional(),
  isApproved: z.boolean().optional().default(false),
  creditsUsed: z.number().optional().default(3),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

export const insertContentRepurposeSchema = contentRepurposeSchema.omit({ id: true, createdAt: true, updatedAt: true }).partial({
  originalContentId: true,
  culturalAdaptations: true,
  toneAdjustments: true,
  qualityScore: true,
  isApproved: true,
  creditsUsed: true
});

export type ContentRepurpose = z.infer<typeof contentRepurposeSchema>;
export type InsertContentRepurpose = z.infer<typeof insertContentRepurposeSchema>;

// ============================================================================
// COMPETITOR ANALYSIS SCHEMA
// ============================================================================
export const competitorAnalysisSchema = z.object({
  id: z.number(),
  workspaceId: z.number(),
  userId: z.number(),
  competitorUsername: z.string(),
  platform: z.string(),
  analysisType: z.string(),
  scrapedData: z.any(),
  analysisResults: z.any(),
  topPerformingPosts: z.any().nullable().optional(),
  contentPatterns: z.any().nullable().optional(),
  hashtags: z.any().nullable().optional(),
  postingSchedule: z.any().nullable().optional(),
  engagementRate: z.number().nullable().optional(),
  growthRate: z.number().nullable().optional(),
  recommendations: z.string(),
  competitorScore: z.number().nullable().optional(),
  lastScraped: z.date().optional(),
  creditsUsed: z.number().optional().default(8),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

export const insertCompetitorAnalysisSchema = competitorAnalysisSchema.omit({ id: true, createdAt: true, updatedAt: true, lastScraped: true }).partial({
  topPerformingPosts: true,
  contentPatterns: true,
  hashtags: true,
  postingSchedule: true,
  engagementRate: true,
  growthRate: true,
  competitorScore: true,
  creditsUsed: true
});

export type CompetitorAnalysis = z.infer<typeof competitorAnalysisSchema>;
export type InsertCompetitorAnalysis = z.infer<typeof insertCompetitorAnalysisSchema>;

// ============================================================================
// TREND CALENDAR SCHEMA
// ============================================================================
export const trendCalendarSchema = z.object({
  id: z.number(),
  workspaceId: z.number(),
  trendTitle: z.string(),
  trendType: z.string(),
  platform: z.string(),
  trendDate: z.date(),
  peakDate: z.date().nullable().optional(),
  description: z.string(),
  relatedHashtags: z.any().nullable().optional(),
  suggestedFormats: z.any().nullable().optional(),
  targetAudience: z.string().nullable().optional(),
  viralityScore: z.number().nullable().optional(),
  difficultyLevel: z.string().nullable().optional(),
  contentSuggestions: z.string().nullable().optional(),
  isGlobal: z.boolean().optional().default(true),
  niche: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  status: z.string().optional().default("active"),
  aiGenerated: z.boolean().optional().default(true),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

export const insertTrendCalendarSchema = trendCalendarSchema.omit({ id: true, createdAt: true, updatedAt: true });

export type TrendCalendar = z.infer<typeof trendCalendarSchema>;
export type InsertTrendCalendar = z.infer<typeof insertTrendCalendarSchema>;

// ============================================================================
// A/B TEST SCHEMA
// ============================================================================
export const abTestSchema = z.object({
  id: z.number(),
  workspaceId: z.number(),
  userId: z.number(),
  testName: z.string(),
  testType: z.string(),
  platform: z.string(),
  variantA: z.any(),
  variantAResults: z.any().nullable().optional(),
  variantAPostId: z.string().nullable().optional(),
  variantB: z.any(),
  variantBResults: z.any().nullable().optional(),
  variantBPostId: z.string().nullable().optional(),
  testDuration: z.number().optional().default(48),
  audienceSplit: z.number().optional().default(50),
  successMetric: z.string(),
  winningVariant: z.string().nullable().optional(),
  confidenceLevel: z.number().nullable().optional(),
  results: z.any().nullable().optional(),
  insights: z.string().nullable().optional(),
  recommendations: z.string().nullable().optional(),
  status: z.string().optional().default("planning"),
  startedAt: z.date().nullable().optional(),
  completedAt: z.date().nullable().optional(),
  creditsUsed: z.number().optional().default(10),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

export const insertABTestSchema = abTestSchema.omit({ id: true, createdAt: true, updatedAt: true });

export type ABTest = z.infer<typeof abTestSchema>;
export type InsertABTest = z.infer<typeof insertABTestSchema>;

// ============================================================================
// ROI CALCULATION SCHEMA
// ============================================================================
export const roiCalculationSchema = z.object({
  id: z.number(),
  workspaceId: z.number(),
  userId: z.number(),
  campaignName: z.string(),
  campaignType: z.string(),
  timeInvested: z.number(),
  hourlyRate: z.number().optional().default(50),
  adSpend: z.number().optional().default(0),
  toolsCost: z.number().optional().default(0),
  otherCosts: z.number().optional().default(0),
  totalInvestment: z.number(),
  directRevenue: z.number().optional().default(0),
  leadValue: z.number().optional().default(0),
  brandValue: z.number().optional().default(0),
  totalReturn: z.number(),
  roiPercentage: z.number(),
  costPerEngagement: z.number().nullable().optional(),
  costPerFollower: z.number().nullable().optional(),
  totalReach: z.number().optional().default(0),
  totalEngagements: z.number().optional().default(0),
  newFollowers: z.number().optional().default(0),
  clickThroughRate: z.number().optional().default(0),
  conversionRate: z.number().optional().default(0),
  insights: z.string().nullable().optional(),
  recommendations: z.string().nullable().optional(),
  benchmarkComparison: z.any().nullable().optional(),
  period: z.string(),
  startDate: z.date(),
  endDate: z.date(),
  creditsUsed: z.number().optional().default(2),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

export const insertROICalculationSchema = roiCalculationSchema.omit({ id: true, createdAt: true, updatedAt: true });

export type ROICalculation = z.infer<typeof roiCalculationSchema>;
export type InsertROICalculation = z.infer<typeof insertROICalculationSchema>;

// ============================================================================
// USER PERSONA SCHEMA
// ============================================================================
export const userPersonaSchema = z.object({
  id: z.number(),
  workspaceId: z.number(),
  userId: z.number(),
  personaName: z.string(),
  isActive: z.boolean().optional().default(true),
  quizAnswers: z.any(),
  refinedNiche: z.string(),
  targetAudience: z.string(),
  contentPillars: z.any(),
  toneProfile: z.any(),
  platformPreferences: z.any(),
  contentFormats: z.any().nullable().optional(),
  postingSchedule: z.any().nullable().optional(),
  hashtagStrategy: z.any().nullable().optional(),
  growthStrategy: z.string().nullable().optional(),
  monthlyThemes: z.any().nullable().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

export const insertUserPersonaSchema = userPersonaSchema.omit({ id: true, createdAt: true, updatedAt: true });

export type UserPersona = z.infer<typeof userPersonaSchema>;
export type InsertUserPersona = z.infer<typeof insertUserPersonaSchema>;

// ============================================================================
// VIDEO JOB SCHEMA
// ============================================================================
export const videoJobSchema = z.object({
  id: z.number(),
  workspaceId: z.number(),
  userId: z.number(),
  jobId: z.string(),
  status: z.string().optional().default("draft"),
  progress: z.number().optional().default(0),
  prompt: z.string(),
  duration: z.number().optional().default(30),
  visualStyle: z.string().optional().default("cinematic"),
  motionEngine: z.string().optional().default("auto"),
  voiceSettings: z.any().nullable().optional(),
  enableAvatar: z.boolean().optional().default(false),
  avatarSettings: z.any().nullable().optional(),
  enableMusic: z.boolean().optional().default(true),
  enableSubtitles: z.boolean().optional().default(true),
  musicStyle: z.string().optional().default("cinematic"),
  script: z.any().nullable().optional(),
  scenes: z.any().nullable().optional(),
  voiceFiles: z.any().nullable().optional(),
  avatarFiles: z.any().nullable().optional(),
  finalVideoUrl: z.string().nullable().optional(),
  generationSteps: z.any().nullable().optional(),
  currentStep: z.string().nullable().optional(),
  creditsUsed: z.number().optional().default(0),
  processingTime: z.number().nullable().optional(),
  videoSize: z.number().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  logs: z.any().nullable().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

export const insertVideoJobSchema = videoJobSchema.omit({ id: true, createdAt: true, updatedAt: true });

export type VideoJob = z.infer<typeof videoJobSchema>;
export type InsertVideoJob = z.infer<typeof insertVideoJobSchema>;

// ============================================================================
// AFFILIATE PROGRAM SCHEMA
// ============================================================================
export const affiliateProgramSchema = z.object({
  id: z.number(),
  workspaceId: z.number(),
  programName: z.string(),
  brandName: z.string(),
  description: z.string(),
  category: z.string(),
  commissionType: z.string(),
  commissionRate: z.number(),
  minimumPayout: z.number().optional().default(50),
  cookieDuration: z.number().optional().default(30),
  productTypes: z.any().nullable().optional(),
  targetAudience: z.string().nullable().optional(),
  requirements: z.any().nullable().optional(),
  applicationStatus: z.string().optional().default("open"),
  paymentSchedule: z.string().nullable().optional(),
  trackingMethod: z.string().nullable().optional(),
  isActive: z.boolean().optional().default(true),
  approvalRequired: z.boolean().optional().default(true),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

export const insertAffiliateProgramSchema = affiliateProgramSchema.omit({ id: true, createdAt: true, updatedAt: true });

export type AffiliateProgram = z.infer<typeof affiliateProgramSchema>;
export type InsertAffiliateProgram = z.infer<typeof insertAffiliateProgramSchema>;

// ============================================================================
// AFFILIATE APPLICATION SCHEMA
// ============================================================================
export const affiliateApplicationSchema = z.object({
  id: z.number(),
  workspaceId: z.number(),
  userId: z.number(),
  programId: z.number(),
  applicationData: z.any(),
  status: z.string().optional().default("pending"),
  approvedAt: z.date().nullable().optional(),
  rejectionReason: z.string().nullable().optional(),
  affiliateLink: z.string().nullable().optional(),
  trackingCode: z.string().nullable().optional(),
  totalClicks: z.number().optional().default(0),
  totalConversions: z.number().optional().default(0),
  totalEarnings: z.number().optional().default(0),
  lastPayoutAt: z.date().nullable().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

export const insertAffiliateApplicationSchema = affiliateApplicationSchema.omit({ id: true, createdAt: true, updatedAt: true });

export type AffiliateApplication = z.infer<typeof affiliateApplicationSchema>;
export type InsertAffiliateApplication = z.infer<typeof insertAffiliateApplicationSchema>;

// ============================================================================
// SOCIAL LISTENING SCHEMA
// ============================================================================
export const socialListeningSchema = z.object({
  id: z.number(),
  workspaceId: z.number(),
  userId: z.number(),
  queryName: z.string(),
  keywords: z.any(),
  platforms: z.any(),
  includeCompetitors: z.boolean().optional().default(false),
  competitorHandles: z.any().nullable().optional(),
  sentiment: z.string().nullable().optional(),
  language: z.string().optional().default("en"),
  location: z.string().nullable().optional(),
  isActive: z.boolean().optional().default(true),
  alertThreshold: z.number().optional().default(10),
  lastScanned: z.date().nullable().optional(),
  totalMentions: z.number().optional().default(0),
  positiveMentions: z.number().optional().default(0),
  negativeMentions: z.number().optional().default(0),
  neutralMentions: z.number().optional().default(0),
  creditsUsed: z.number().optional().default(0),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

export const insertSocialListeningSchema = socialListeningSchema.omit({ id: true, createdAt: true, updatedAt: true });

export type SocialListening = z.infer<typeof socialListeningSchema>;
export type InsertSocialListening = z.infer<typeof insertSocialListeningSchema>;

// ============================================================================
// SOCIAL MENTION SCHEMA
// ============================================================================
export const socialMentionSchema = z.object({
  id: z.number(),
  listeningQueryId: z.number(),
  platform: z.string(),
  postId: z.string(),
  authorUsername: z.string(),
  authorFollowers: z.number().nullable().optional(),
  content: z.string(),
  url: z.string(),
  sentiment: z.string(),
  sentimentScore: z.number().nullable().optional(),
  engagement: z.any().nullable().optional(),
  isInfluencer: z.boolean().optional().default(false),
  requiresResponse: z.boolean().optional().default(false),
  suggestedResponse: z.string().nullable().optional(),
  hasResponded: z.boolean().optional().default(false),
  isRead: z.boolean().optional().default(false),
  tags: z.any().nullable().optional(),
  mentionedAt: z.date(),
  scrapedAt: z.date().optional(),
  createdAt: z.date().optional()
});

export type SocialMention = z.infer<typeof socialMentionSchema>;

// ============================================================================
// USER PROGRESS SCHEMA (Gamification)
// ============================================================================
export const userProgressSchema = z.object({
  id: z.number(),
  userId: z.number(),
  workspaceId: z.number(),
  totalXP: z.number().optional().default(0),
  level: z.number().optional().default(1),
  currentLevelXP: z.number().optional().default(0),
  xpToNextLevel: z.number().optional().default(100),
  totalBadges: z.number().optional().default(0),
  streak: z.number().optional().default(0),
  longestStreak: z.number().optional().default(0),
  lastActiveDate: z.date().nullable().optional(),
  achievements: z.any().nullable().optional(),
  currentMissions: z.any().nullable().optional(),
  completedMissions: z.any().nullable().optional(),
  seasonStats: z.any().nullable().optional(),
  leaderboardRank: z.number().nullable().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

export const insertUserProgressSchema = userProgressSchema.omit({ id: true, createdAt: true, updatedAt: true });

export type UserProgress = z.infer<typeof userProgressSchema>;
export type InsertUserProgress = z.infer<typeof insertUserProgressSchema>;

// ============================================================================
// GAMIFICATION EVENT SCHEMA
// ============================================================================
export const gamificationEventSchema = z.object({
  id: z.number(),
  userId: z.number(),
  workspaceId: z.number(),
  eventType: z.string(),
  eventData: z.any().nullable().optional(),
  xpEarned: z.number().optional().default(0),
  badgeEarned: z.string().nullable().optional(),
  missionProgress: z.any().nullable().optional(),
  streakBonus: z.number().optional().default(0),
  isProcessed: z.boolean().optional().default(false),
  createdAt: z.date().optional()
});

export type GamificationEvent = z.infer<typeof gamificationEventSchema>;

// ============================================================================
// CONTENT PROTECTION SCHEMA
// ============================================================================
export const contentProtectionSchema = z.object({
  id: z.number(),
  workspaceId: z.number(),
  userId: z.number(),
  originalContentId: z.string(),
  contentType: z.string(),
  contentHash: z.string(),
  watermarkApplied: z.boolean().optional().default(false),
  watermarkType: z.string().nullable().optional(),
  protectionLevel: z.string().optional().default("standard"),
  monitoringEnabled: z.boolean().optional().default(true),
  scanFrequency: z.string().optional().default("weekly"),
  lastScanAt: z.date().nullable().optional(),
  totalThefts: z.number().optional().default(0),
  activeThefts: z.number().optional().default(0),
  resolvedThefts: z.number().optional().default(0),
  creditsUsed: z.number().optional().default(0),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

export type ContentProtection = z.infer<typeof contentProtectionSchema>;

// ============================================================================
// CONTENT THEFT SCHEMA
// ============================================================================
export const contentTheftSchema = z.object({
  id: z.number(),
  protectionId: z.number(),
  theftUrl: z.string(),
  theftPlatform: z.string(),
  thiefUsername: z.string().nullable().optional(),
  similarityScore: z.number(),
  theftType: z.string(),
  status: z.string().optional().default("detected"),
  actionTaken: z.string().nullable().optional(),
  detectedAt: z.date().optional(),
  reportedAt: z.date().nullable().optional(),
  resolvedAt: z.date().nullable().optional(),
  notes: z.string().nullable().optional(),
  autoDetected: z.boolean().optional().default(true),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

export type ContentTheft = z.infer<typeof contentTheftSchema>;

// ============================================================================
// LEGAL TEMPLATE SCHEMA
// ============================================================================
export const legalTemplateSchema = z.object({
  id: z.number(),
  templateName: z.string(),
  templateType: z.string(),
  category: z.string(),
  description: z.string(),
  templateContent: z.string(),
  requiredFields: z.any(),
  optionalFields: z.any().nullable().optional(),
  jurisdiction: z.string().optional().default("US"),
  language: z.string().optional().default("en"),
  lastReviewed: z.date().optional(),
  version: z.string().optional().default("1.0"),
  isActive: z.boolean().optional().default(true),
  usageCount: z.number().optional().default(0),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

export type LegalTemplate = z.infer<typeof legalTemplateSchema>;

// ============================================================================
// GENERATED LEGAL DOC SCHEMA
// ============================================================================
export const generatedLegalDocSchema = z.object({
  id: z.number(),
  workspaceId: z.number(),
  userId: z.number(),
  templateId: z.number(),
  documentName: z.string(),
  generatedContent: z.string(),
  customizations: z.any(),
  aiSuggestions: z.string().nullable().optional(),
  status: z.string().optional().default("draft"),
  downloadCount: z.number().optional().default(0),
  lastDownloadAt: z.date().nullable().optional(),
  creditsUsed: z.number().optional().default(5),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

export type GeneratedLegalDoc = z.infer<typeof generatedLegalDocSchema>;

// ============================================================================
// EMOTION ANALYSIS SCHEMA
// ============================================================================
export const emotionAnalysisSchema = z.object({
  id: z.number(),
  workspaceId: z.number(),
  contentId: z.string(),
  platform: z.string(),
  analysisType: z.string(),
  emotionData: z.any(),
  dominantEmotion: z.string(),
  emotionScores: z.any(),
  sentimentScore: z.number(),
  engagementCorrelation: z.any().nullable().optional(),
  recommendations: z.string().nullable().optional(),
  totalComments: z.number().optional().default(0),
  processedComments: z.number().optional().default(0),
  creditsUsed: z.number().optional().default(3),
  analyzedAt: z.date().optional(),
  createdAt: z.date().optional()
});

export const insertEmotionAnalysisSchema = emotionAnalysisSchema.omit({ id: true, createdAt: true, analyzedAt: true });

export type EmotionAnalysis = z.infer<typeof emotionAnalysisSchema>;
export type InsertEmotionAnalysis = z.infer<typeof insertEmotionAnalysisSchema>;

// ============================================================================
// FIXED POST SCHEMA
// ============================================================================
export const fixedPostSchema = z.object({
  id: z.number(),
  workspaceId: z.number(),
  userId: z.number(),
  contentId: z.string(),
  platform: z.string(),
  postUrl: z.string().nullable().optional(),
  title: z.string(),
  description: z.string().nullable().optional(),
  thumbnailUrl: z.string().nullable().optional(),
  isPinned: z.boolean().optional().default(true),
  displayOrder: z.number().optional().default(0),
  metrics: z.any().nullable().optional(),
  pinnedAt: z.date().optional(),
  unpinnedAt: z.date().nullable().optional(),
  isActive: z.boolean().optional().default(true),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

export type FixedPost = z.infer<typeof fixedPostSchema>;

// ============================================================================
// CHAT CONVERSATION SCHEMA
// ============================================================================
export const chatConversationSchema = z.object({
  id: z.number(),
  userId: z.number(),
  workspaceId: z.number(),
  title: z.string().default("New chat"),
  messageCount: z.number().optional().default(0),
  lastMessageAt: z.date().nullable().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

export const insertChatConversationSchema = chatConversationSchema.omit({ id: true, createdAt: true, updatedAt: true });

export type ChatConversation = z.infer<typeof chatConversationSchema>;
export type InsertChatConversation = z.infer<typeof insertChatConversationSchema>;

// ============================================================================
// CHAT MESSAGE SCHEMA
// ============================================================================
export const chatMessageSchema = z.object({
  id: z.number(),
  conversationId: z.number(),
  role: z.string(),
  content: z.string(),
  tokensUsed: z.number().optional().default(0),
  createdAt: z.date().optional()
});

export const insertChatMessageSchema = chatMessageSchema.omit({ id: true, createdAt: true });

export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;

// ============================================================================
// CONTENT SCHEMA
// ============================================================================
export const contentSchema = z.object({
  id: z.number(),
  workspaceId: z.number(),
  type: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  contentData: z.any().nullable().optional(),
  prompt: z.string().nullable().optional(),
  platform: z.string().nullable().optional(),
  status: z.string().optional().default("draft"),
  creditsUsed: z.number().optional().default(0),
  scheduledAt: z.date().nullable().optional(),
  publishedAt: z.date().nullable().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

export const insertContentSchema = z.object({
  workspaceId: z.union([z.number(), z.string()]),
  type: z.string(),
  title: z.string(),
  description: z.string().optional(),
  contentData: z.any().optional(),
  prompt: z.string().optional(),
  platform: z.string().optional(),
  status: z.string().optional(),
  creditsUsed: z.number().optional(),
  scheduledAt: z.date().optional()
});

export type Content = z.infer<typeof contentSchema>;
export type InsertContent = z.infer<typeof insertContentSchema>;

// ============================================================================
// ANALYTICS SCHEMA
// ============================================================================
export const analyticsSchema = z.object({
  id: z.number(),
  workspaceId: z.number(),
  contentId: z.number().nullable().optional(),
  platform: z.string(),
  postId: z.string().nullable().optional(),
  metrics: z.any().nullable().optional(),
  date: z.date().optional(),
  createdAt: z.date().optional()
});

export const insertAnalyticsSchema = z.object({
  workspaceId: z.number(),
  contentId: z.number().optional(),
  platform: z.string(),
  postId: z.string().optional(),
  metrics: z.any().optional(),
  date: z.date().optional()
});

export type Analytics = z.infer<typeof analyticsSchema>;
export type InsertAnalytics = z.infer<typeof insertAnalyticsSchema>;

// ============================================================================
// AUTOMATION RULE SCHEMA
// ============================================================================
export const automationRuleSchema = z.object({
  id: z.number(),
  workspaceId: z.number(),
  name: z.string(),
  description: z.string().nullable().optional(),
  trigger: z.any().nullable().optional(),
  action: z.any().nullable().optional(),
  isActive: z.boolean().optional().default(true),
  lastRun: z.date().nullable().optional(),
  nextRun: z.date().nullable().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

export const insertAutomationRuleSchema = z.object({
  workspaceId: z.number(),
  name: z.string(),
  description: z.string().optional(),
  trigger: z.any().optional(),
  action: z.any().optional(),
  isActive: z.boolean().optional(),
  nextRun: z.date().optional()
});

export type AutomationRule = z.infer<typeof automationRuleSchema>;
export type InsertAutomationRule = z.infer<typeof insertAutomationRuleSchema>;

// ============================================================================
// AUTOMATION LOG SCHEMA
// ============================================================================
export const automationLogSchema = z.object({
  id: z.number(),
  ruleId: z.number(),
  workspaceId: z.number(),
  type: z.string(),
  targetUserId: z.string().nullable().optional(),
  targetUsername: z.string().nullable().optional(),
  message: z.string(),
  status: z.string(),
  errorMessage: z.string().nullable().optional(),
  sentAt: z.date().optional()
});

export type AutomationLog = z.infer<typeof automationLogSchema>;

// ============================================================================
// SUGGESTION SCHEMA
// ============================================================================
export const suggestionSchema = z.object({
  id: z.number(),
  workspaceId: z.number(),
  type: z.string(),
  data: z.any().nullable().optional(),
  confidence: z.number().optional().default(0),
  isUsed: z.boolean().optional().default(false),
  validUntil: z.date().nullable().optional(),
  createdAt: z.date().optional()
});

export const insertSuggestionSchema = z.object({
  workspaceId: z.number(),
  type: z.string(),
  data: z.any().optional(),
  confidence: z.number().optional(),
  validUntil: z.date().optional()
});

export type Suggestion = z.infer<typeof suggestionSchema>;
export type InsertSuggestion = z.infer<typeof insertSuggestionSchema>;

// ============================================================================
// CONTENT RECOMMENDATION SCHEMA
// ============================================================================
export const contentRecommendationSchema = z.object({
  id: z.number(),
  workspaceId: z.number(),
  type: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  thumbnailUrl: z.string().nullable().optional(),
  mediaUrl: z.string().nullable().optional(),
  duration: z.number().nullable().optional(),
  category: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  tags: z.any().nullable().optional(),
  engagement: z.any().nullable().optional(),
  sourceUrl: z.string().nullable().optional(),
  isActive: z.boolean().optional().default(true),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

export const insertContentRecommendationSchema = z.object({
  workspaceId: z.number(),
  type: z.string(),
  title: z.string(),
  description: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  mediaUrl: z.string().optional(),
  duration: z.number().optional(),
  category: z.string().optional(),
  country: z.string().optional(),
  tags: z.any().optional(),
  engagement: z.any().optional(),
  sourceUrl: z.string().optional(),
  isActive: z.boolean().optional()
});

export type ContentRecommendation = z.infer<typeof contentRecommendationSchema>;
export type InsertContentRecommendation = z.infer<typeof insertContentRecommendationSchema>;

// ============================================================================
// USER CONTENT HISTORY SCHEMA
// ============================================================================
export const userContentHistorySchema = z.object({
  id: z.number(),
  userId: z.number(),
  workspaceId: z.number(),
  recommendationId: z.number().nullable().optional(),
  action: z.string(),
  metadata: z.any().nullable().optional(),
  createdAt: z.date().optional()
});

export const insertUserContentHistorySchema = z.object({
  userId: z.number(),
  workspaceId: z.number(),
  recommendationId: z.number().optional(),
  action: z.string(),
  metadata: z.any().optional()
});

export type UserContentHistory = z.infer<typeof userContentHistorySchema>;
export type InsertUserContentHistory = z.infer<typeof insertUserContentHistorySchema>;

// ============================================================================
// CREDIT TRANSACTION SCHEMA
// ============================================================================
export const creditTransactionSchema = z.object({
  id: z.number(),
  userId: z.number(),
  workspaceId: z.number().nullable().optional(),
  type: z.string(),
  amount: z.number(),
  description: z.string().nullable().optional(),
  referenceId: z.string().nullable().optional(),
  createdAt: z.date().optional()
});

export const insertCreditTransactionSchema = z.object({
  userId: z.number(),
  workspaceId: z.number().optional(),
  type: z.string(),
  amount: z.number(),
  description: z.string().optional(),
  referenceId: z.string().optional()
});

export type CreditTransaction = z.infer<typeof creditTransactionSchema>;
export type InsertCreditTransaction = z.infer<typeof insertCreditTransactionSchema>;

// ============================================================================
// REFERRAL SCHEMA
// ============================================================================
export const referralSchema = z.object({
  id: z.number(),
  referrerId: z.number(),
  referredId: z.number(),
  status: z.string().optional().default("pending"),
  rewardAmount: z.number().optional().default(0),
  createdAt: z.date().optional(),
  confirmedAt: z.date().nullable().optional()
});

export const insertReferralSchema = z.object({
  referrerId: z.number(),
  referredId: z.number(),
  rewardAmount: z.number().optional()
});

export type Referral = z.infer<typeof referralSchema>;
export type InsertReferral = z.infer<typeof insertReferralSchema>;

// ============================================================================
// SUBSCRIPTION SCHEMA
// ============================================================================
export const subscriptionSchema = z.object({
  id: z.number(),
  userId: z.number(),
  plan: z.string(),
  status: z.string(),
  interval: z.string().optional().default("month"),
  priceId: z.string().nullable().optional(),
  subscriptionId: z.string().nullable().optional(),
  currentPeriodStart: z.date().nullable().optional(),
  currentPeriodEnd: z.date().nullable().optional(),
  trialEnd: z.date().nullable().optional(),
  canceledAt: z.date().nullable().optional(),
  monthlyCredits: z.number().optional().default(0),
  extraCredits: z.number().optional().default(0),
  totalCredits: z.number().optional().default(0),
  autoRenew: z.boolean().optional().default(true),
  lastPaymentFailed: z.boolean().optional().default(false),
  failureReason: z.string().nullable().optional(),
  nextBillingDate: z.date().nullable().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

export const insertSubscriptionSchema = z.object({
  userId: z.number(),
  plan: z.string(),
  status: z.string(),
  priceId: z.string().optional(),
  subscriptionId: z.string().optional(),
  currentPeriodStart: z.date().optional(),
  currentPeriodEnd: z.date().optional(),
  trialEnd: z.date().optional(),
  monthlyCredits: z.number().optional(),
  extraCredits: z.number().optional(),
  autoRenew: z.boolean().optional()
});

export type Subscription = z.infer<typeof subscriptionSchema>;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;

// ============================================================================
// CREDIT PACKAGE SCHEMA
// ============================================================================
export const creditPackageSchema = z.object({
  id: z.number(),
  name: z.string(),
  credits: z.number(),
  price: z.number(),
  currency: z.string().optional().default("INR"),
  bonusPercentage: z.number().optional().default(0),
  isActive: z.boolean().optional().default(true),
  createdAt: z.date().optional()
});

export const insertCreditPackageSchema = z.object({
  name: z.string(),
  credits: z.number(),
  price: z.number(),
  currency: z.string().optional(),
  bonusPercentage: z.number().optional(),
  isActive: z.boolean().optional()
});

export type CreditPackage = z.infer<typeof creditPackageSchema>;
export type InsertCreditPackage = z.infer<typeof insertCreditPackageSchema>;

// ============================================================================
// PAYMENT SCHEMA
// ============================================================================
export const paymentSchema = z.object({
  id: z.number(),
  userId: z.number(),
  razorpayOrderId: z.string(),
  razorpayPaymentId: z.string().nullable().optional(),
  razorpaySignature: z.string().nullable().optional(),
  amount: z.number(),
  currency: z.string().optional().default("INR"),
  status: z.string().optional().default("created"),
  purpose: z.string(),
  metadata: z.any().nullable().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

export const insertPaymentSchema = z.object({
  userId: z.number(),
  razorpayOrderId: z.string(),
  razorpayPaymentId: z.string().optional(),
  razorpaySignature: z.string().optional(),
  amount: z.number(),
  currency: z.string().optional(),
  status: z.string().optional(),
  purpose: z.string(),
  metadata: z.any().optional()
});

export type Payment = z.infer<typeof paymentSchema>;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;

// ============================================================================
// ADDON SCHEMA
// ============================================================================
export const addonSchema = z.object({
  id: z.number(),
  userId: z.number(),
  type: z.string(),
  name: z.string(),
  price: z.number(),
  isActive: z.boolean().optional().default(true),
  expiresAt: z.date().nullable().optional(),
  metadata: z.any().nullable().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

export const insertAddonSchema = z.object({
  userId: z.number(),
  type: z.string(),
  name: z.string(),
  price: z.number(),
  isActive: z.boolean().optional(),
  expiresAt: z.date().optional(),
  metadata: z.any().optional()
});

export type Addon = z.infer<typeof addonSchema>;
export type InsertAddon = z.infer<typeof insertAddonSchema>;

// ============================================================================
// FEATURE USAGE SCHEMA
// ============================================================================
export const featureUsageSchema = z.object({
  id: z.number(),
  userId: z.number(),
  featureId: z.string(),
  usageCount: z.number().optional().default(0),
  lastUsed: z.date().nullable().optional(),
  resetAt: z.date().nullable().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

export type FeatureUsage = z.infer<typeof featureUsageSchema>;

// ============================================================================
// FEATURE ACCESS SCHEMA
// ============================================================================
export const featureAccessSchema = z.object({
  id: z.number(),
  userId: z.number(),
  featureId: z.string(),
  accessLevel: z.string(),
  limit: z.number().nullable().optional(),
  restriction: z.string().nullable().optional(),
  grantedAt: z.date().optional(),
  expiresAt: z.date().nullable().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

export type FeatureAccess = z.infer<typeof featureAccessSchema>;

// ============================================================================
// DM CONVERSATION SCHEMA
// ============================================================================
export const dmConversationSchema = z.object({
  id: z.number(),
  workspaceId: z.number(),
  platform: z.string(),
  participantId: z.string(),
  participantUsername: z.string().nullable().optional(),
  participantDisplayName: z.string().nullable().optional(),
  participantAvatar: z.string().nullable().optional(),
  isFollower: z.boolean().optional().default(false),
  isFollowing: z.boolean().optional().default(false),
  relationshipStatus: z.string().optional().default("unknown"),
  totalMessages: z.number().optional().default(0),
  unreadCount: z.number().optional().default(0),
  lastMessageAt: z.date().nullable().optional(),
  conversationSummary: z.string().nullable().optional(),
  customerJourney: z.string().optional().default("unknown"),
  leadScore: z.number().optional().default(0),
  tags: z.any().nullable().optional(),
  customFields: z.any().nullable().optional(),
  isPriority: z.boolean().optional().default(false),
  isArchived: z.boolean().optional().default(false),
  firstContactAt: z.date().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

export const insertDmConversationSchema = z.object({
  workspaceId: z.number(),
  platform: z.string(),
  participantId: z.string(),
  participantUsername: z.string().optional()
});

export type DmConversation = z.infer<typeof dmConversationSchema>;
export type InsertDmConversation = z.infer<typeof insertDmConversationSchema>;

// ============================================================================
// DM MESSAGE SCHEMA
// ============================================================================
export const dmMessageSchema = z.object({
  id: z.number(),
  conversationId: z.number(),
  messageId: z.string(),
  sender: z.string(),
  content: z.string(),
  messageType: z.string().optional().default("text"),
  mediaUrls: z.any().nullable().optional(),
  isFromUser: z.boolean().optional().default(false),
  sentiment: z.string().nullable().optional(),
  sentimentScore: z.number().nullable().optional(),
  topics: z.any().nullable().optional(),
  intent: z.string().nullable().optional(),
  urgency: z.string().optional().default("normal"),
  aiResponse: z.string().nullable().optional(),
  aiConfidence: z.number().nullable().optional(),
  responseStatus: z.string().optional().default("pending"),
  automationRuleId: z.number().nullable().optional(),
  isRead: z.boolean().optional().default(false),
  readAt: z.date().nullable().optional(),
  platformTimestamp: z.date().nullable().optional(),
  createdAt: z.date().optional()
});

export const insertDmMessageSchema = z.object({
  conversationId: z.number(),
  messageId: z.string(),
  sender: z.string(),
  content: z.string(),
  messageType: z.string().optional(),
  sentiment: z.string().optional(),
  topics: z.any().optional(),
  aiResponse: z.string().optional(),
  automationRuleId: z.number().optional()
});

export type DmMessage = z.infer<typeof dmMessageSchema>;
export type InsertDmMessage = z.infer<typeof insertDmMessageSchema>;

// ============================================================================
// CONVERSATION CONTEXT SCHEMA
// ============================================================================
export const conversationContextSchema = z.object({
  id: z.number(),
  conversationId: z.number(),
  contextType: z.string(),
  contextValue: z.string(),
  confidence: z.number().optional().default(0),
  source: z.string().optional().default("ai"),
  expiresAt: z.date().nullable().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

export const insertConversationContextSchema = z.object({
  conversationId: z.number(),
  contextType: z.string(),
  contextValue: z.string(),
  confidence: z.number().optional(),
  expiresAt: z.date().optional()
});

export type ConversationContext = z.infer<typeof conversationContextSchema>;
export type InsertConversationContext = z.infer<typeof insertConversationContextSchema>;

// ============================================================================
// THUMBNAIL PROJECT SCHEMA
// ============================================================================
export const thumbnailProjectSchema = z.object({
  id: z.number(),
  userId: z.number(),
  workspaceId: z.number(),
  title: z.string(),
  description: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  uploadedImageUrl: z.string().nullable().optional(),
  status: z.string().optional().default("draft"),
  stage: z.number().optional().default(1),
  creditsUsed: z.number().optional().default(0),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

export const insertThumbnailProjectSchema = z.object({
  userId: z.number(),
  workspaceId: z.number(),
  title: z.string(),
  description: z.string().optional(),
  category: z.string().optional(),
  uploadedImageUrl: z.string().optional(),
  status: z.string().optional(),
  stage: z.number().optional()
});

export type ThumbnailProject = z.infer<typeof thumbnailProjectSchema>;
export type InsertThumbnailProject = z.infer<typeof insertThumbnailProjectSchema>;

// ============================================================================
// THUMBNAIL STRATEGY SCHEMA
// ============================================================================
export const thumbnailStrategySchema = z.object({
  id: z.number(),
  projectId: z.number(),
  titles: z.any().nullable().optional(),
  ctas: z.any().nullable().optional(),
  fonts: z.any().nullable().optional(),
  colors: z.any().nullable().optional(),
  style: z.string().nullable().optional(),
  emotion: z.string().nullable().optional(),
  hooks: z.any().nullable().optional(),
  placement: z.any().nullable().optional(),
  createdAt: z.date().optional()
});

export const insertThumbnailStrategySchema = z.object({
  projectId: z.number(),
  titles: z.any().optional(),
  ctas: z.any().optional(),
  fonts: z.any().optional(),
  colors: z.any().optional(),
  style: z.string().optional(),
  emotion: z.string().optional(),
  hooks: z.any().optional(),
  placement: z.any().optional()
});

export type ThumbnailStrategy = z.infer<typeof thumbnailStrategySchema>;
export type InsertThumbnailStrategy = z.infer<typeof insertThumbnailStrategySchema>;

// ============================================================================
// TRENDING THUMBNAIL SCHEMA
// ============================================================================
export const trendingThumbnailSchema = z.object({
  id: z.number(),
  sourceUrl: z.string(),
  thumbnailUrl: z.string(),
  title: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  viewCount: z.number().nullable().optional(),
  engagement: z.any().nullable().optional(),
  visualFeatures: z.any().nullable().optional(),
  layoutStyle: z.string().nullable().optional(),
  visualMotif: z.string().nullable().optional(),
  emojis: z.array(z.string()).nullable().optional(),
  filters: z.array(z.string()).nullable().optional(),
  scrapedAt: z.date().optional(),
  isActive: z.boolean().optional().default(true)
});

export const insertTrendingThumbnailSchema = z.object({
  sourceUrl: z.string(),
  thumbnailUrl: z.string(),
  title: z.string().optional(),
  category: z.string().optional(),
  viewCount: z.number().optional(),
  engagement: z.any().optional(),
  visualFeatures: z.any().optional(),
  layoutStyle: z.string().optional(),
  visualMotif: z.string().optional(),
  emojis: z.array(z.string()).optional(),
  filters: z.array(z.string()).optional(),
  isActive: z.boolean().optional()
});

export type TrendingThumbnail = z.infer<typeof trendingThumbnailSchema>;
export type InsertTrendingThumbnail = z.infer<typeof insertTrendingThumbnailSchema>;

// ============================================================================
// THUMBNAIL MATCH SCHEMA
// ============================================================================
export const thumbnailMatchSchema = z.object({
  id: z.number(),
  projectId: z.number(),
  trendingThumbnailId: z.number(),
  similarity: z.number().nullable().optional(),
  matchedFeatures: z.array(z.string()).nullable().optional(),
  createdAt: z.date().optional()
});

export type ThumbnailMatch = z.infer<typeof thumbnailMatchSchema>;

// ============================================================================
// THUMBNAIL VARIANT SCHEMA
// ============================================================================
export const thumbnailVariantSchema = z.object({
  id: z.number(),
  projectId: z.number(),
  variantNumber: z.number(),
  layoutType: z.string(),
  previewUrl: z.string(),
  layerMetadata: z.any().nullable().optional(),
  layoutClassification: z.string().nullable().optional(),
  predictedCtr: z.number().nullable().optional(),
  composition: z.any().nullable().optional(),
  createdAt: z.date().optional()
});

export const insertThumbnailVariantSchema = z.object({
  projectId: z.number(),
  variantNumber: z.number(),
  layoutType: z.string(),
  previewUrl: z.string(),
  layerMetadata: z.any().optional(),
  layoutClassification: z.string().optional(),
  predictedCtr: z.number().optional(),
  composition: z.any().optional()
});

export type ThumbnailVariant = z.infer<typeof thumbnailVariantSchema>;
export type InsertThumbnailVariant = z.infer<typeof insertThumbnailVariantSchema>;

// ============================================================================
// CANVAS EDITOR SESSION SCHEMA
// ============================================================================
export const canvasEditorSessionSchema = z.object({
  id: z.number(),
  variantId: z.number(),
  userId: z.number(),
  canvasData: z.any().nullable().optional(),
  layers: z.any().nullable().optional(),
  editHistory: z.any().nullable().optional(),
  lastSaved: z.date().optional(),
  isActive: z.boolean().optional().default(true),
  createdAt: z.date().optional()
});

export const insertCanvasEditorSessionSchema = z.object({
  variantId: z.number(),
  userId: z.number(),
  canvasData: z.any().optional(),
  layers: z.any().optional(),
  editHistory: z.any().optional(),
  isActive: z.boolean().optional()
});

export type CanvasEditorSession = z.infer<typeof canvasEditorSessionSchema>;
export type InsertCanvasEditorSession = z.infer<typeof insertCanvasEditorSessionSchema>;

// ============================================================================
// THUMBNAIL EXPORT SCHEMA
// ============================================================================
export const thumbnailExportSchema = z.object({
  id: z.number(),
  sessionId: z.number(),
  format: z.string(),
  exportUrl: z.string(),
  downloadCount: z.number().optional().default(0),
  cloudStorageUrl: z.string().nullable().optional(),
  metadata: z.any().nullable().optional(),
  createdAt: z.date().optional()
});

export const insertThumbnailExportSchema = z.object({
  sessionId: z.number(),
  format: z.string(),
  exportUrl: z.string(),
  cloudStorageUrl: z.string().optional(),
  metadata: z.any().optional()
});

export type ThumbnailExport = z.infer<typeof thumbnailExportSchema>;
export type InsertThumbnailExport = z.infer<typeof insertThumbnailExportSchema>;

// ============================================================================
// THUMBNAIL STYLE SCHEMA
// ============================================================================
export const thumbnailStyleSchema = z.object({
  id: z.number(),
  name: z.string(),
  category: z.string(),
  styleRules: z.any().nullable().optional(),
  templateData: z.any().nullable().optional(),
  previewUrl: z.string().nullable().optional(),
  popularityScore: z.number().optional().default(0),
  isActive: z.boolean().optional().default(true),
  createdAt: z.date().optional()
});

export const insertThumbnailStyleSchema = z.object({
  name: z.string(),
  category: z.string(),
  styleRules: z.any().optional(),
  templateData: z.any().optional(),
  previewUrl: z.string().optional(),
  popularityScore: z.number().optional(),
  isActive: z.boolean().optional()
});

export type ThumbnailStyle = z.infer<typeof thumbnailStyleSchema>;
export type InsertThumbnailStyle = z.infer<typeof insertThumbnailStyleSchema>;

// ============================================================================
// WAITLIST USER SCHEMA
// ============================================================================
export const waitlistUserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string(),
  referralCode: z.string(),
  referredBy: z.string().nullable().optional(),
  referralCount: z.number().optional().default(0),
  credits: z.number().optional().default(0),
  status: z.string().optional().default("waitlisted"),
  discountCode: z.string().nullable().optional(),
  discountExpiresAt: z.date().nullable().optional(),
  dailyLogins: z.number().optional().default(0),
  feedbackSubmitted: z.boolean().optional().default(false),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

export const insertWaitlistUserSchema = z.object({
  name: z.string(),
  email: z.string(),
  referredBy: z.string().optional()
});

export type WaitlistUser = z.infer<typeof waitlistUserSchema>;
export type InsertWaitlistUser = z.infer<typeof insertWaitlistUserSchema>;

// ============================================================================
// ADMIN SCHEMA
// ============================================================================
export const adminSchema = z.object({
  id: z.number(),
  email: z.string(),
  username: z.string(),
  password: z.string(),
  role: z.string().optional().default("admin"),
  isActive: z.boolean().optional().default(true),
  lastLogin: z.date().nullable().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

export const insertAdminSchema = z.object({
  email: z.string(),
  username: z.string(),
  password: z.string(),
  role: z.string().optional(),
  isActive: z.boolean().optional()
});

export type Admin = z.infer<typeof adminSchema>;
export type InsertAdmin = z.infer<typeof insertAdminSchema>;

// ============================================================================
// ADMIN SESSION SCHEMA
// ============================================================================
export const adminSessionSchema = z.object({
  id: z.number(),
  adminId: z.number(),
  token: z.string(),
  ipAddress: z.string().nullable().optional(),
  userAgent: z.string().nullable().optional(),
  expiresAt: z.date(),
  createdAt: z.date().optional()
});

export const insertAdminSessionSchema = z.object({
  adminId: z.number(),
  token: z.string(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
  expiresAt: z.date()
});

export type AdminSession = z.infer<typeof adminSessionSchema>;
export type InsertAdminSession = z.infer<typeof insertAdminSessionSchema>;

// ============================================================================
// NOTIFICATION SCHEMA
// ============================================================================
export const notificationSchema = z.object({
  id: z.number(),
  userId: z.number().nullable().optional(),
  title: z.string(),
  message: z.string(),
  type: z.string().optional().default("info"),
  isRead: z.boolean().optional().default(false),
  targetUsers: z.array(z.string()).nullable().optional(),
  scheduledFor: z.date().nullable().optional(),
  sentAt: z.date().nullable().optional(),
  createdAt: z.date().optional()
});

export const insertNotificationSchema = z.object({
  userId: z.number().optional(),
  title: z.string(),
  message: z.string(),
  type: z.string().optional(),
  targetUsers: z.array(z.string()).optional(),
  scheduledFor: z.date().optional()
});

export type Notification = z.infer<typeof notificationSchema>;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;

// ============================================================================
// POPUP SCHEMA
// ============================================================================
export const popupSchema = z.object({
  id: z.number(),
  title: z.string(),
  content: z.string(),
  type: z.string().optional().default("announcement"),
  buttonText: z.string().nullable().optional(),
  buttonLink: z.string().nullable().optional(),
  isActive: z.boolean().optional().default(true),
  startDate: z.date().nullable().optional(),
  endDate: z.date().nullable().optional(),
  targetPages: z.array(z.string()).nullable().optional(),
  frequency: z.string().optional().default("once"),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

export const insertPopupSchema = z.object({
  title: z.string(),
  content: z.string(),
  type: z.string().optional(),
  buttonText: z.string().optional(),
  buttonLink: z.string().optional(),
  isActive: z.boolean().optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  targetPages: z.array(z.string()).optional(),
  frequency: z.string().optional()
});

export type Popup = z.infer<typeof popupSchema>;
export type InsertPopup = z.infer<typeof insertPopupSchema>;

// ============================================================================
// APP SETTING SCHEMA
// ============================================================================
export const appSettingSchema = z.object({
  id: z.number(),
  key: z.string(),
  value: z.string(),
  type: z.string().optional().default("string"),
  category: z.string().optional().default("general"),
  description: z.string().nullable().optional(),
  isPublic: z.boolean().optional().default(false),
  updatedBy: z.number().nullable().optional(),
  updatedAt: z.date().optional()
});

export const insertAppSettingSchema = z.object({
  key: z.string(),
  value: z.string(),
  type: z.string().optional(),
  category: z.string().optional(),
  description: z.string().optional(),
  isPublic: z.boolean().optional(),
  updatedBy: z.number().optional()
});

export type AppSetting = z.infer<typeof appSettingSchema>;
export type InsertAppSetting = z.infer<typeof insertAppSettingSchema>;

// ============================================================================
// AUDIT LOG SCHEMA
// ============================================================================
export const auditLogSchema = z.object({
  id: z.number(),
  adminId: z.number().nullable().optional(),
  action: z.string(),
  entity: z.string().nullable().optional(),
  entityId: z.string().nullable().optional(),
  oldValues: z.any().nullable().optional(),
  newValues: z.any().nullable().optional(),
  ipAddress: z.string().nullable().optional(),
  userAgent: z.string().nullable().optional(),
  createdAt: z.date().optional()
});

export const insertAuditLogSchema = z.object({
  adminId: z.number().optional(),
  action: z.string(),
  entity: z.string().optional(),
  entityId: z.string().optional(),
  oldValues: z.any().optional(),
  newValues: z.any().optional(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional()
});

export type AuditLog = z.infer<typeof auditLogSchema>;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;

// ============================================================================
// FEEDBACK MESSAGE SCHEMA
// ============================================================================
export const feedbackMessageSchema = z.object({
  id: z.number(),
  userId: z.number().nullable().optional(),
  subject: z.string(),
  message: z.string(),
  category: z.string().optional().default("general"),
  priority: z.string().optional().default("medium"),
  status: z.string().optional().default("open"),
  adminNotes: z.string().nullable().optional(),
  assignedTo: z.number().nullable().optional(),
  respondedAt: z.date().nullable().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional()
});

export const insertFeedbackMessageSchema = z.object({
  userId: z.number().optional(),
  subject: z.string(),
  message: z.string(),
  category: z.string().optional(),
  priority: z.string().optional(),
  status: z.string().optional(),
  adminNotes: z.string().optional(),
  assignedTo: z.number().optional()
});

export type FeedbackMessage = z.infer<typeof feedbackMessageSchema>;
export type InsertFeedbackMessage = z.infer<typeof insertFeedbackMessageSchema>;
