import { pgTable, text, serial, integer, boolean, timestamp, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
export const users = pgTable("users", {
    id: serial("id").primaryKey(),
    firebaseUid: text("firebase_uid").notNull().unique(),
    email: text("email").notNull().unique(),
    username: text("username").notNull().unique(),
    displayName: text("display_name"),
    avatar: text("avatar"),
    credits: integer("credits").default(50),
    plan: text("plan").default("free"), // free, starter, pro, business, agency
    planStatus: text("plan_status").default("active"), // active, expired, canceled, past_due
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    referralCode: text("referral_code").unique(),
    referredBy: text("referred_by"),
    totalReferrals: integer("total_referrals").default(0),
    totalEarned: integer("total_earned").default(0),
    isOnboarded: boolean("is_onboarded").default(false),
    // Early access system fields
    status: text("status").default("waitlisted"), // waitlisted, early_access, launched
    trialExpiresAt: timestamp("trial_expires_at"),
    discountCode: text("discount_code"),
    discountExpiresAt: timestamp("discount_expires_at"),
    hasUsedWaitlistBonus: boolean("has_used_waitlist_bonus").default(false),
    hasClaimedWelcomeBonus: boolean("has_claimed_welcome_bonus").default(false),
    welcomeBonusClaimedAt: timestamp("welcome_bonus_claimed_at"),
    dailyLoginStreak: integer("daily_login_streak").default(0),
    lastLoginAt: timestamp("last_login_at"),
    feedbackSubmittedAt: timestamp("feedback_submitted_at"),
    isEmailVerified: boolean("is_email_verified").default(false),
    emailVerificationCode: text("email_verification_code"),
    emailVerificationExpiry: timestamp("email_verification_expiry"),
    onboardingStep: integer("onboarding_step").default(1), // Current onboarding step
    onboardingData: json("onboarding_data"), // Onboarding responses
    preferences: json("preferences"), // User preferences for AI personalization
    goals: json("goals"), // User goals and objectives
    niche: text("niche"), // User's business niche
    targetAudience: text("target_audience"), // Target audience description
    contentStyle: text("content_style"), // Preferred content style
    postingFrequency: text("posting_frequency"), // How often they want to post
    socialPlatforms: json("social_platforms"), // Which platforms they use
    businessType: text("business_type"), // Type of business
    experienceLevel: text("experience_level"), // Social media experience level
    primaryObjective: text("primary_objective"), // Main goal (followers, sales, engagement, etc.)
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow()
});
export const workspaces = pgTable("workspaces", {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id).notNull(),
    name: text("name").notNull(),
    description: text("description"),
    avatar: text("avatar"),
    theme: text("theme").default("default"),
    aiPersonality: text("ai_personality"),
    credits: integer("credits").default(0),
    isDefault: boolean("is_default").default(false),
    maxTeamMembers: integer("max_team_members").default(1), // Based on subscription
    inviteCode: text("invite_code").unique(), // For easy team invites
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow()
});
// Workspace team members and roles
export const workspaceMembers = pgTable("workspace_members", {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id").references(() => workspaces.id).notNull(),
    userId: integer("user_id").references(() => users.id).notNull(),
    role: text("role").notNull(), // owner, editor, viewer
    permissions: json("permissions"), // Custom permissions object
    invitedBy: integer("invited_by").references(() => users.id),
    joinedAt: timestamp("joined_at").defaultNow(),
    status: text("status").default("active"), // active, pending, suspended
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow()
});
// Team invitations
export const teamInvitations = pgTable("team_invitations", {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id").references(() => workspaces.id).notNull(),
    invitedBy: integer("invited_by").references(() => users.id).notNull(),
    email: text("email").notNull(),
    role: text("role").notNull(), // editor, viewer
    permissions: json("permissions"),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    status: text("status").default("pending"), // pending, accepted, expired, cancelled
    acceptedAt: timestamp("accepted_at"),
    createdAt: timestamp("created_at").defaultNow()
});
export const socialAccounts = pgTable("social_accounts", {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id").references(() => workspaces.id).notNull(),
    platform: text("platform").notNull(), // instagram, twitter, youtube, tiktok
    accountId: text("account_id").notNull(),
    username: text("username").notNull(),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token"),
    expiresAt: timestamp("expires_at"),
    isActive: boolean("is_active").default(true),
    // Platform-specific profile data
    followersCount: integer("followers_count"),
    followingCount: integer("following_count"),
    mediaCount: integer("media_count"),
    biography: text("biography"),
    website: text("website"),
    profilePictureUrl: text("profile_picture_url"),
    // YouTube-specific data
    subscriberCount: integer("subscriber_count"),
    videoCount: integer("video_count"),
    viewCount: integer("view_count"),
    channelDescription: text("channel_description"),
    channelThumbnail: text("channel_thumbnail"),
    accountType: text("account_type"), // PERSONAL, BUSINESS, CREATOR
    isBusinessAccount: boolean("is_business_account").default(false),
    isVerified: boolean("is_verified").default(false),
    // Performance metrics for AI analysis
    totalLikes: integer("total_likes").default(0),
    totalComments: integer("total_comments").default(0),
    totalShares: integer("total_shares").default(0),
    totalSaves: integer("total_saves").default(0),
    totalReach: integer("total_reach").default(0),
    totalImpressions: integer("total_impressions").default(0),
    avgEngagement: integer("avg_engagement").default(0),
    lastSyncAt: timestamp("last_sync_at"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow()
});
// AI Features Schema - Creative Brief Generator
export const creativeBriefs = pgTable("creative_briefs", {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id").references(() => workspaces.id).notNull(),
    userId: integer("user_id").references(() => users.id).notNull(),
    title: text("title").notNull(),
    targetAudience: text("target_audience").notNull(),
    platforms: json("platforms").notNull(), // ['instagram', 'youtube', 'tiktok']
    campaignGoals: json("campaign_goals").notNull(), // ['awareness', 'engagement', 'conversions']
    tone: text("tone").notNull(), // 'professional', 'casual', 'humorous'
    style: text("style").notNull(), // 'minimalist', 'bold', 'vintage'
    industry: text("industry").notNull(),
    deadline: timestamp("deadline"),
    budget: integer("budget"),
    briefContent: text("brief_content").notNull(), // AI-generated structured brief
    keyMessages: json("key_messages"), // AI-suggested key messages
    contentFormats: json("content_formats"), // ['post', 'reel', 'story', 'video']
    hashtags: json("hashtags"), // AI-suggested hashtags
    references: json("references"), // URLs or descriptions
    status: text("status").default("draft"), // draft, active, completed
    creditsUsed: integer("credits_used").default(5), // Credits consumed for generation
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow()
});
// Multi-Language Content Repurposing
export const contentRepurposes = pgTable("content_repurposes", {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id").references(() => workspaces.id).notNull(),
    userId: integer("user_id").references(() => users.id).notNull(),
    originalContentId: integer("original_content_id"), // References original content if exists
    sourceLanguage: text("source_language").notNull(), // 'en', 'es', 'fr', 'hi'
    targetLanguage: text("target_language").notNull(),
    sourceContent: text("source_content").notNull(), // Original text
    repurposedContent: text("repurposed_content").notNull(), // AI-translated & localized
    contentType: text("content_type").notNull(), // 'caption', 'hashtags', 'script'
    culturalAdaptations: json("cultural_adaptations"), // Notes on cultural changes made
    toneAdjustments: json("tone_adjustments"), // How tone was adapted for target culture
    platform: text("platform").notNull(), // Target platform for optimization
    qualityScore: integer("quality_score"), // AI confidence score 1-100
    isApproved: boolean("is_approved").default(false),
    creditsUsed: integer("credits_used").default(3),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow()
});
// Competitor Analysis Engine
export const competitorAnalyses = pgTable("competitor_analyses", {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id").references(() => workspaces.id).notNull(),
    userId: integer("user_id").references(() => users.id).notNull(),
    competitorUsername: text("competitor_username").notNull(),
    platform: text("platform").notNull(), // 'instagram', 'youtube', 'tiktok'
    analysisType: text("analysis_type").notNull(), // 'full_profile', 'recent_posts', 'trending_content'
    scrapedData: json("scraped_data").notNull(), // Raw data from scraping/APIs
    analysisResults: json("analysis_results").notNull(), // AI-processed insights
    topPerformingPosts: json("top_performing_posts"), // Best posts with metrics
    contentPatterns: json("content_patterns"), // Identified patterns in their content
    hashtags: json("hashtags"), // Their most used hashtags
    postingSchedule: json("posting_schedule"), // When they post most
    engagementRate: integer("engagement_rate"), // Average engagement %
    growthRate: integer("growth_rate"), // Monthly growth %
    recommendations: text("recommendations").notNull(), // AI-generated action items
    competitorScore: integer("competitor_score"), // Overall competitiveness 1-100
    lastScraped: timestamp("last_scraped").defaultNow(),
    creditsUsed: integer("credits_used").default(8),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow()
});
// Trend Calendar & Viral Planner
export const trendCalendar = pgTable("trend_calendar", {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id").references(() => workspaces.id).notNull(),
    trendTitle: text("trend_title").notNull(),
    trendType: text("trend_type").notNull(), // 'hashtag', 'audio', 'challenge', 'event', 'seasonal'
    platform: text("platform").notNull(),
    trendDate: timestamp("trend_date").notNull(), // When the trend is/was popular
    peakDate: timestamp("peak_date"), // Predicted or actual peak
    description: text("description").notNull(),
    relatedHashtags: json("related_hashtags"),
    suggestedFormats: json("suggested_formats"), // ['reel', 'post', 'story']
    targetAudience: text("target_audience"),
    viralityScore: integer("virality_score"), // 1-100 predicted viral potential
    difficultyLevel: text("difficulty_level"), // 'easy', 'medium', 'hard'
    contentSuggestions: text("content_suggestions"), // AI-generated content ideas
    isGlobal: boolean("is_global").default(true), // Global vs niche trend
    niche: text("niche"), // Specific niche if not global
    source: text("source"), // Where trend was detected
    status: text("status").default("active"), // active, declining, dead
    aiGenerated: boolean("ai_generated").default(true), // Was this AI-predicted
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow()
});
// A/B Testing Module
export const abTests = pgTable("ab_tests", {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id").references(() => workspaces.id).notNull(),
    userId: integer("user_id").references(() => users.id).notNull(),
    testName: text("test_name").notNull(),
    testType: text("test_type").notNull(), // 'caption', 'hashtags', 'posting_time', 'format'
    platform: text("platform").notNull(),
    // Variant A
    variantA: json("variant_a").notNull(), // Content, hashtags, timing, etc.
    variantAResults: json("variant_a_results"), // Metrics after posting
    variantAPostId: text("variant_a_post_id"), // Platform-specific post ID
    // Variant B
    variantB: json("variant_b").notNull(),
    variantBResults: json("variant_b_results"),
    variantBPostId: text("variant_b_post_id"),
    // Test Configuration
    testDuration: integer("test_duration").default(48), // Hours to run test
    audienceSplit: integer("audience_split").default(50), // % for A vs B
    successMetric: text("success_metric").notNull(), // 'engagement', 'reach', 'clicks'
    // Results
    winningVariant: text("winning_variant"), // 'A', 'B', or 'tie'
    confidenceLevel: integer("confidence_level"), // Statistical confidence %
    results: json("results"), // Full analysis results
    insights: text("insights"), // AI-generated insights
    recommendations: text("recommendations"), // Next steps
    status: text("status").default("planning"), // planning, running, analyzing, completed
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    creditsUsed: integer("credits_used").default(10),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow()
});
// ROI Calculator
export const roiCalculations = pgTable("roi_calculations", {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id").references(() => workspaces.id).notNull(),
    userId: integer("user_id").references(() => users.id).notNull(),
    campaignName: text("campaign_name").notNull(),
    campaignType: text("campaign_type").notNull(), // 'organic', 'paid', 'influencer', 'sponsored'
    // Investment Costs
    timeInvested: integer("time_invested").notNull(), // Hours
    hourlyRate: integer("hourly_rate").default(50), // $/hour
    adSpend: integer("ad_spend").default(0), // $ spent on ads
    toolsCost: integer("tools_cost").default(0), // $ on tools/software
    otherCosts: integer("other_costs").default(0), // Misc costs
    totalInvestment: integer("total_investment").notNull(), // Auto-calculated
    // Returns
    directRevenue: integer("direct_revenue").default(0), // $ directly attributable
    leadValue: integer("lead_value").default(0), // Estimated value of leads
    brandValue: integer("brand_value").default(0), // Brand awareness value
    totalReturn: integer("total_return").notNull(), // Auto-calculated
    // Metrics
    roiPercentage: integer("roi_percentage").notNull(), // (Return - Investment) / Investment * 100
    costPerEngagement: integer("cost_per_engagement"), // Investment / Total Engagements
    costPerFollower: integer("cost_per_follower"), // Investment / New Followers
    // Performance Data
    totalReach: integer("total_reach").default(0),
    totalEngagements: integer("total_engagements").default(0),
    newFollowers: integer("new_followers").default(0),
    clickThroughRate: integer("click_through_rate").default(0), // %
    conversionRate: integer("conversion_rate").default(0), // %
    // AI Insights
    insights: text("insights"), // AI-generated ROI insights
    recommendations: text("recommendations"), // How to improve ROI
    benchmarkComparison: json("benchmark_comparison"), // vs industry benchmarks
    period: text("period").notNull(), // '7d', '30d', '90d', 'custom'
    startDate: timestamp("start_date").notNull(),
    endDate: timestamp("end_date").notNull(),
    creditsUsed: integer("credits_used").default(2),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow()
});
// User Personas & AI Personalization
export const userPersonas = pgTable("user_personas", {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id").references(() => workspaces.id).notNull(),
    userId: integer("user_id").references(() => users.id).notNull(),
    personaName: text("persona_name").notNull(), // 'Fitness Coach', 'Tech Reviewer'
    isActive: boolean("is_active").default(true),
    // Quiz Results
    quizAnswers: json("quiz_answers").notNull(), // Structured responses
    refinedNiche: text("refined_niche").notNull(), // AI-determined ultra-specific niche
    targetAudience: text("target_audience").notNull(), // Who they should target
    contentPillars: json("content_pillars").notNull(), // Main content themes
    toneProfile: json("tone_profile").notNull(), // Voice & tone characteristics
    platformPreferences: json("platform_preferences").notNull(), // Best platforms for them
    // AI-Generated Suggestions
    contentFormats: json("content_formats"), // Best formats for their niche
    postingSchedule: json("posting_schedule"), // Optimal times/frequency
    hashtagStrategy: json("hashtag_strategy"), // Hashtag recommendations
    growthStrategy: text("growth_strategy"), // Long-term growth plan
    monthlyThemes: json("monthly_themes"), // Content calendar themes
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow()
});
// AI Video Generator Jobs
export const videoJobs = pgTable("video_jobs", {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id").references(() => workspaces.id).notNull(),
    userId: integer("user_id").references(() => users.id).notNull(),
    jobId: text("job_id").notNull().unique(), // Unique job identifier
    status: text("status").default("draft"), // draft, generating, completed, failed
    progress: integer("progress").default(0), // 0-100 percentage
    // Input Configuration
    prompt: text("prompt").notNull(), // User's video idea/prompt
    duration: integer("duration").default(30), // Video duration in seconds
    visualStyle: text("visual_style").default("cinematic"), // cinematic, realistic, animated, etc.
    motionEngine: text("motion_engine").default("auto"), // auto, runway, animatediff
    // Voice Settings
    voiceSettings: json("voice_settings"), // { gender, language, accent, tone }
    enableAvatar: boolean("enable_avatar").default(false),
    avatarSettings: json("avatar_settings"), // Avatar configuration
    // Content Settings
    enableMusic: boolean("enable_music").default(true),
    enableSubtitles: boolean("enable_subtitles").default(true),
    musicStyle: text("music_style").default("cinematic"),
    // Generated Content
    script: json("script"), // Generated script with scenes
    scenes: json("scenes"), // Scene data with images/videos
    voiceFiles: json("voice_files"), // Generated voice files
    avatarFiles: json("avatar_files"), // Generated avatar files
    finalVideoUrl: text("final_video_url"), // URL to final video
    // Processing Steps
    generationSteps: json("generation_steps"), // Step-by-step progress
    currentStep: text("current_step"), // Current processing step
    // Metrics
    creditsUsed: integer("credits_used").default(0),
    processingTime: integer("processing_time"), // Time taken in seconds
    videoSize: integer("video_size"), // Final video size in bytes
    // Metadata
    errorMessage: text("error_message"), // Error details if failed
    logs: json("logs"), // Processing logs
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow()
});
// Affiliate Engine
export const affiliatePrograms = pgTable("affiliate_programs", {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id").references(() => workspaces.id).notNull(),
    programName: text("program_name").notNull(),
    brandName: text("brand_name").notNull(),
    description: text("description").notNull(),
    category: text("category").notNull(), // 'tech', 'fitness', 'beauty', 'finance'
    commissionType: text("commission_type").notNull(), // 'percentage', 'flat', 'cpa'
    commissionRate: integer("commission_rate").notNull(), // % or $
    minimumPayout: integer("minimum_payout").default(50), // $
    cookieDuration: integer("cookie_duration").default(30), // days
    productTypes: json("product_types"), // Types of products
    targetAudience: text("target_audience"),
    requirements: json("requirements"), // Follower count, niche, etc.
    applicationStatus: text("application_status").default("open"), // open, invite_only, closed
    paymentSchedule: text("payment_schedule"), // 'weekly', 'monthly', 'net30'
    trackingMethod: text("tracking_method"), // 'link', 'code', 'pixel'
    isActive: boolean("is_active").default(true),
    approvalRequired: boolean("approval_required").default(true),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow()
});
export const affiliateApplications = pgTable("affiliate_applications", {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id").references(() => workspaces.id).notNull(),
    userId: integer("user_id").references(() => users.id).notNull(),
    programId: integer("program_id").references(() => affiliatePrograms.id).notNull(),
    applicationData: json("application_data").notNull(), // Form responses
    status: text("status").default("pending"), // pending, approved, rejected, paused
    approvedAt: timestamp("approved_at"),
    rejectionReason: text("rejection_reason"),
    affiliateLink: text("affiliate_link"), // Generated unique link
    trackingCode: text("tracking_code"), // Unique tracking code
    totalClicks: integer("total_clicks").default(0),
    totalConversions: integer("total_conversions").default(0),
    totalEarnings: integer("total_earnings").default(0), // In cents
    lastPayoutAt: timestamp("last_payout_at"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow()
});
// Social Listening Engine
export const socialListening = pgTable("social_listening", {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id").references(() => workspaces.id).notNull(),
    userId: integer("user_id").references(() => users.id).notNull(),
    queryName: text("query_name").notNull(), // User-defined name
    keywords: json("keywords").notNull(), // Keywords to monitor
    platforms: json("platforms").notNull(), // ['twitter', 'reddit', 'instagram']
    includeCompetitors: boolean("include_competitors").default(false),
    competitorHandles: json("competitor_handles"), // Handles to monitor
    sentiment: text("sentiment"), // 'positive', 'negative', 'neutral', 'all'
    language: text("language").default("en"),
    location: text("location"), // Optional geo-targeting
    isActive: boolean("is_active").default(true),
    alertThreshold: integer("alert_threshold").default(10), // Mentions to trigger alert
    lastScanned: timestamp("last_scanned"),
    totalMentions: integer("total_mentions").default(0),
    positiveMentions: integer("positive_mentions").default(0),
    negativeMentions: integer("negative_mentions").default(0),
    neutralMentions: integer("neutral_mentions").default(0),
    creditsUsed: integer("credits_used").default(0), // Per scan
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow()
});
export const socialMentions = pgTable("social_mentions", {
    id: serial("id").primaryKey(),
    listeningQueryId: integer("listening_query_id").references(() => socialListening.id).notNull(),
    platform: text("platform").notNull(), // 'twitter', 'reddit', 'instagram'
    postId: text("post_id").notNull(), // Platform-specific post ID
    authorUsername: text("author_username").notNull(),
    authorFollowers: integer("author_followers"),
    content: text("content").notNull(), // The mention text
    url: text("url").notNull(), // Direct link to post
    sentiment: text("sentiment").notNull(), // 'positive', 'negative', 'neutral'
    sentimentScore: integer("sentiment_score"), // -100 to +100
    engagement: json("engagement"), // Likes, shares, comments
    isInfluencer: boolean("is_influencer").default(false), // High follower count
    requiresResponse: boolean("requires_response").default(false), // AI suggests response
    suggestedResponse: text("suggested_response"), // AI-generated response
    hasResponded: boolean("has_responded").default(false),
    isRead: boolean("is_read").default(false),
    tags: json("tags"), // AI-generated tags for categorization
    mentionedAt: timestamp("mentioned_at").notNull(),
    scrapedAt: timestamp("scraped_at").defaultNow(),
    createdAt: timestamp("created_at").defaultNow()
});
// Gamification System
export const userProgress = pgTable("user_progress", {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id).notNull(),
    workspaceId: integer("workspace_id").references(() => workspaces.id).notNull(),
    totalXP: integer("total_xp").default(0),
    level: integer("level").default(1),
    currentLevelXP: integer("current_level_xp").default(0), // XP in current level
    xpToNextLevel: integer("xp_to_next_level").default(100), // XP needed for next level
    totalBadges: integer("total_badges").default(0),
    streak: integer("streak").default(0), // Current activity streak (days)
    longestStreak: integer("longest_streak").default(0),
    lastActiveDate: timestamp("last_active_date"),
    achievements: json("achievements"), // Unlocked achievements
    currentMissions: json("current_missions"), // Active missions
    completedMissions: json("completed_missions"), // Completed missions
    seasonStats: json("season_stats"), // Seasonal challenge stats
    leaderboardRank: integer("leaderboard_rank"), // Position in workspace leaderboard
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow()
});
export const gamificationEvents = pgTable("gamification_events", {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id).notNull(),
    workspaceId: integer("workspace_id").references(() => workspaces.id).notNull(),
    eventType: text("event_type").notNull(), // 'content_created', 'post_published', 'engagement_milestone'
    eventData: json("event_data"), // Context about the event
    xpEarned: integer("xp_earned").default(0),
    badgeEarned: text("badge_earned"), // Badge ID if earned
    missionProgress: json("mission_progress"), // Progress on active missions
    streakBonus: integer("streak_bonus").default(0), // Extra XP for streak
    isProcessed: boolean("is_processed").default(false),
    createdAt: timestamp("created_at").defaultNow()
});
// Content Theft Detection
export const contentProtection = pgTable("content_protection", {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id").references(() => workspaces.id).notNull(),
    userId: integer("user_id").references(() => users.id).notNull(),
    originalContentId: text("original_content_id").notNull(), // Reference to original content
    contentType: text("content_type").notNull(), // 'image', 'video', 'text'
    contentHash: text("content_hash").notNull(), // AI-generated hash/fingerprint
    watermarkApplied: boolean("watermark_applied").default(false),
    watermarkType: text("watermark_type"), // 'visible', 'invisible', 'both'
    protectionLevel: text("protection_level").default("standard"), // standard, premium
    monitoringEnabled: boolean("monitoring_enabled").default(true),
    scanFrequency: text("scan_frequency").default("weekly"), // daily, weekly, monthly
    lastScanAt: timestamp("last_scan_at"),
    totalThefts: integer("total_thefts").default(0),
    activeThefts: integer("active_thefts").default(0),
    resolvedThefts: integer("resolved_thefts").default(0),
    creditsUsed: integer("credits_used").default(0), // Per scan
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow()
});
export const contentThefts = pgTable("content_thefts", {
    id: serial("id").primaryKey(),
    protectionId: integer("protection_id").references(() => contentProtection.id).notNull(),
    theftUrl: text("theft_url").notNull(), // Where stolen content was found
    theftPlatform: text("theft_platform").notNull(), // Platform where theft occurred
    thiefUsername: text("thief_username"), // Username of thief if available
    similarityScore: integer("similarity_score").notNull(), // % similarity (0-100)
    theftType: text("theft_type").notNull(), // 'exact_copy', 'modified', 'cropped'
    status: text("status").default("detected"), // detected, reported, dmca_sent, resolved, ignored
    actionTaken: text("action_taken"), // What action was taken
    detectedAt: timestamp("detected_at").defaultNow(),
    reportedAt: timestamp("reported_at"),
    resolvedAt: timestamp("resolved_at"),
    notes: text("notes"), // User notes about this theft
    autoDetected: boolean("auto_detected").default(true), // AI detected vs manual report
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow()
});
// Legal Assistant
export const legalTemplates = pgTable("legal_templates", {
    id: serial("id").primaryKey(),
    templateName: text("template_name").notNull(),
    templateType: text("template_type").notNull(), // 'contract', 'nda', 'terms', 'disclaimer'
    category: text("category").notNull(), // 'influencer', 'brand', 'general'
    description: text("description").notNull(),
    templateContent: text("template_content").notNull(), // Fillable template
    requiredFields: json("required_fields").notNull(), // Fields user must fill
    optionalFields: json("optional_fields"), // Optional customization fields
    jurisdiction: text("jurisdiction").default("US"), // Legal jurisdiction
    language: text("language").default("en"),
    lastReviewed: timestamp("last_reviewed").defaultNow(),
    version: text("version").default("1.0"),
    isActive: boolean("is_active").default(true),
    usageCount: integer("usage_count").default(0),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow()
});
export const generatedLegalDocs = pgTable("generated_legal_docs", {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id").references(() => workspaces.id).notNull(),
    userId: integer("user_id").references(() => users.id).notNull(),
    templateId: integer("template_id").references(() => legalTemplates.id).notNull(),
    documentName: text("document_name").notNull(),
    generatedContent: text("generated_content").notNull(), // Final document
    customizations: json("customizations").notNull(), // User-provided data
    aiSuggestions: text("ai_suggestions"), // AI-provided legal suggestions
    status: text("status").default("draft"), // draft, finalized, signed
    downloadCount: integer("download_count").default(0),
    lastDownloadAt: timestamp("last_download_at"),
    creditsUsed: integer("credits_used").default(5),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow()
});
// Emotion Analysis
export const emotionAnalyses = pgTable("emotion_analyses", {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id").references(() => workspaces.id).notNull(),
    contentId: text("content_id").notNull(), // Platform-specific content ID
    platform: text("platform").notNull(), // 'instagram', 'youtube', 'twitter'
    analysisType: text("analysis_type").notNull(), // 'comments', 'caption', 'overall'
    emotionData: json("emotion_data").notNull(), // Raw emotion analysis results
    dominantEmotion: text("dominant_emotion").notNull(), // 'joy', 'sadness', 'anger', 'fear', 'surprise'
    emotionScores: json("emotion_scores").notNull(), // Scores for each emotion
    sentimentScore: integer("sentiment_score").notNull(), // -100 to +100
    engagementCorrelation: json("engagement_correlation"), // How emotions correlate with engagement
    recommendations: text("recommendations"), // AI suggestions based on emotions
    totalComments: integer("total_comments").default(0),
    processedComments: integer("processed_comments").default(0),
    creditsUsed: integer("credits_used").default(3),
    analyzedAt: timestamp("analyzed_at").defaultNow(),
    createdAt: timestamp("created_at").defaultNow()
});
// Fixed Post System
export const fixedPosts = pgTable("fixed_posts", {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id").references(() => workspaces.id).notNull(),
    userId: integer("user_id").references(() => users.id).notNull(),
    contentId: text("content_id").notNull(), // Reference to original content
    platform: text("platform").notNull(),
    postUrl: text("post_url"),
    title: text("title").notNull(),
    description: text("description"),
    thumbnailUrl: text("thumbnail_url"),
    isPinned: boolean("is_pinned").default(true),
    displayOrder: integer("display_order").default(0), // Order in pinned feed
    metrics: json("metrics"), // Performance metrics when pinned
    pinnedAt: timestamp("pinned_at").defaultNow(),
    unpinnedAt: timestamp("unpinned_at"),
    isActive: boolean("is_active").default(true),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow()
});
// VeeGPT Chat System
export const chatConversations = pgTable("chat_conversations", {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id).notNull(),
    workspaceId: integer("workspace_id").references(() => workspaces.id).notNull(),
    title: text("title").notNull().default("New chat"),
    messageCount: integer("message_count").default(0),
    lastMessageAt: timestamp("last_message_at"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow()
});
export const chatMessages = pgTable("chat_messages", {
    id: serial("id").primaryKey(),
    conversationId: integer("conversation_id").references(() => chatConversations.id).notNull(),
    role: text("role").notNull(), // 'user' or 'assistant'
    content: text("content").notNull(),
    tokensUsed: integer("tokens_used").default(0),
    createdAt: timestamp("created_at").defaultNow()
});
// Zod schemas for validation
export const insertCreativeBriefSchema = createInsertSchema(creativeBriefs);
export const insertContentRepurposeSchema = createInsertSchema(contentRepurposes);
export const insertCompetitorAnalysisSchema = createInsertSchema(competitorAnalyses);
export const insertTrendCalendarSchema = createInsertSchema(trendCalendar);
export const insertABTestSchema = createInsertSchema(abTests);
export const insertROICalculationSchema = createInsertSchema(roiCalculations);
export const insertUserPersonaSchema = createInsertSchema(userPersonas);
export const insertAffiliateApplicationSchema = createInsertSchema(affiliateApplications);
export const insertSocialListeningSchema = createInsertSchema(socialListening);
export const insertEmotionAnalysisSchema = createInsertSchema(emotionAnalyses);
export const insertChatConversationSchema = createInsertSchema(chatConversations);
export const insertChatMessageSchema = createInsertSchema(chatMessages);
// Video Jobs types
export const insertVideoJobSchema = createInsertSchema(videoJobs).omit({ id: true, createdAt: true, updatedAt: true });
export const content = pgTable("content", {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id").references(() => workspaces.id).notNull(),
    type: text("type").notNull(), // video, reel, post, caption, thumbnail
    title: text("title").notNull(),
    description: text("description"),
    contentData: json("content_data"), // Generated content, URLs, etc.
    prompt: text("prompt"),
    platform: text("platform"),
    status: text("status").default("draft"), // draft, ready, published, scheduled
    creditsUsed: integer("credits_used").default(0),
    scheduledAt: timestamp("scheduled_at"),
    publishedAt: timestamp("published_at"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow()
});
export const analytics = pgTable("analytics", {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id").references(() => workspaces.id).notNull(),
    contentId: integer("content_id").references(() => content.id),
    platform: text("platform").notNull(),
    postId: text("post_id"),
    metrics: json("metrics"), // views, likes, comments, shares, etc.
    date: timestamp("date").defaultNow(),
    createdAt: timestamp("created_at").defaultNow()
});
export const automationRules = pgTable("automation_rules", {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id").references(() => workspaces.id).notNull(),
    name: text("name").notNull(),
    description: text("description"),
    trigger: json("trigger"), // Trigger conditions
    action: json("action"), // Action to perform
    isActive: boolean("is_active").default(true),
    lastRun: timestamp("last_run"),
    nextRun: timestamp("next_run"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow()
});
export const suggestions = pgTable("suggestions", {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id").references(() => workspaces.id).notNull(),
    type: text("type").notNull(), // trending, audio, hashtag, content
    data: json("data"), // Suggestion content
    confidence: integer("confidence").default(0), // 0-100
    isUsed: boolean("is_used").default(false),
    validUntil: timestamp("valid_until"),
    createdAt: timestamp("created_at").defaultNow()
});
export const contentRecommendations = pgTable("content_recommendations", {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id").references(() => workspaces.id).notNull(),
    type: text("type").notNull(), // video, reel, audio
    title: text("title").notNull(),
    description: text("description"),
    thumbnailUrl: text("thumbnail_url"),
    mediaUrl: text("media_url"),
    duration: integer("duration"), // in seconds
    category: text("category"), // niche/interest category
    country: text("country"), // country code for regional content
    tags: json("tags"), // array of relevant tags
    engagement: json("engagement"), // likes, views, shares data
    sourceUrl: text("source_url"), // original source reference
    isActive: boolean("is_active").default(true),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow()
});
export const userContentHistory = pgTable("user_content_history", {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id).notNull(),
    workspaceId: integer("workspace_id").references(() => workspaces.id).notNull(),
    recommendationId: integer("recommendation_id").references(() => contentRecommendations.id),
    action: text("action").notNull(), // viewed, liked, created_similar, dismissed
    metadata: json("metadata"), // additional tracking data
    createdAt: timestamp("created_at").defaultNow()
});
export const automationLogs = pgTable("automation_logs", {
    id: serial("id").primaryKey(),
    ruleId: integer("rule_id").references(() => automationRules.id).notNull(),
    workspaceId: integer("workspace_id").references(() => workspaces.id).notNull(),
    type: text("type").notNull(), // comment, dm
    targetUserId: text("target_user_id"),
    targetUsername: text("target_username"),
    message: text("message").notNull(),
    status: text("status").notNull(), // sent, failed, pending
    errorMessage: text("error_message"),
    sentAt: timestamp("sent_at").defaultNow()
});
export const creditTransactions = pgTable("credit_transactions", {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id).notNull(),
    workspaceId: integer("workspace_id").references(() => workspaces.id),
    type: text("type").notNull(), // purchase, earned, used, refund
    amount: integer("amount").notNull(),
    description: text("description"),
    referenceId: text("reference_id"), // Stripe payment intent, content ID, etc.
    createdAt: timestamp("created_at").defaultNow()
});
export const referrals = pgTable("referrals", {
    id: serial("id").primaryKey(),
    referrerId: integer("referrer_id").references(() => users.id).notNull(),
    referredId: integer("referred_id").references(() => users.id).notNull(),
    status: text("status").default("pending"), // pending, confirmed, rewarded
    rewardAmount: integer("reward_amount").default(0),
    createdAt: timestamp("created_at").defaultNow(),
    confirmedAt: timestamp("confirmed_at")
});
export const subscriptions = pgTable("subscriptions", {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id).notNull(),
    plan: text("plan").notNull(), // free, starter, pro, business, agency
    status: text("status").notNull(), // active, canceled, expired, trial, past_due
    interval: text("interval").default("month"), // month, year
    priceId: text("price_id"), // Razorpay price ID
    subscriptionId: text("subscription_id"), // Razorpay subscription ID
    currentPeriodStart: timestamp("current_period_start"),
    currentPeriodEnd: timestamp("current_period_end"),
    trialEnd: timestamp("trial_end"),
    canceledAt: timestamp("canceled_at"),
    monthlyCredits: integer("monthly_credits").default(0), // Plan-based monthly credits
    extraCredits: integer("extra_credits").default(0), // Purchased credits
    totalCredits: integer("total_credits").default(0), // Combined credits
    autoRenew: boolean("auto_renew").default(true),
    lastPaymentFailed: boolean("last_payment_failed").default(false),
    failureReason: text("failure_reason"), // Why payment failed
    nextBillingDate: timestamp("next_billing_date"), // Next billing attempt
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow()
});
export const creditPackages = pgTable("credit_packages", {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    credits: integer("credits").notNull(),
    price: integer("price").notNull(), // Price in paise/cents
    currency: text("currency").default("INR"),
    bonusPercentage: integer("bonus_percentage").default(0),
    isActive: boolean("is_active").default(true),
    createdAt: timestamp("created_at").defaultNow()
});
export const payments = pgTable("payments", {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id).notNull(),
    razorpayOrderId: text("razorpay_order_id").notNull(),
    razorpayPaymentId: text("razorpay_payment_id"),
    razorpaySignature: text("razorpay_signature"),
    amount: integer("amount").notNull(),
    currency: text("currency").default("INR"),
    status: text("status").default("created"), // created, paid, failed, refunded
    purpose: text("purpose").notNull(), // subscription, credits, addon
    metadata: json("metadata"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow()
});
export const addons = pgTable("addons", {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id).notNull(),
    type: text("type").notNull(), // workspace, social-account, ai-visual, etc.
    name: text("name").notNull(),
    price: integer("price").notNull(),
    isActive: boolean("is_active").default(true),
    expiresAt: timestamp("expires_at"),
    metadata: json("metadata"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow()
});
// Feature Usage Tracking
export const featureUsage = pgTable("feature_usage", {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id).notNull(),
    featureId: text("feature_id").notNull(), // creative-brief, ai-suggestions, etc.
    usageCount: integer("usage_count").default(0),
    lastUsed: timestamp("last_used"),
    resetAt: timestamp("reset_at"), // When monthly limit resets
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow()
});
// Feature Access Control
export const featureAccess = pgTable("feature_access", {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id).notNull(),
    featureId: text("feature_id").notNull(), // creative-brief, ai-suggestions, etc.
    accessLevel: text("access_level").notNull(), // allowed, limited, blocked
    limit: integer("limit"), // Monthly/usage limit
    restriction: text("restriction"), // Any special restrictions
    grantedAt: timestamp("granted_at").defaultNow(),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow()
});
// DM Conversation Memory System for 3-day contextual AI responses
export const dmConversations = pgTable("dm_conversations", {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id").references(() => workspaces.id).notNull(),
    platform: text("platform").notNull(), // instagram, twitter, etc.
    participantId: text("participant_id").notNull(), // Instagram user ID or handle
    participantUsername: text("participant_username"), // Display name for reference
    lastMessageAt: timestamp("last_message_at").defaultNow(),
    messageCount: integer("message_count").default(0),
    isActive: boolean("is_active").default(true),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow()
});
export const dmMessages = pgTable("dm_messages", {
    id: serial("id").primaryKey(),
    conversationId: integer("conversation_id").references(() => dmConversations.id).notNull(),
    messageId: text("message_id"), // Platform-specific message ID
    sender: text("sender").notNull(), // 'user' or 'ai'
    content: text("content").notNull(),
    messageType: text("message_type").default("text"), // text, image, sticker, etc.
    sentiment: text("sentiment"), // positive, negative, neutral (AI analyzed)
    topics: text("topics").array(), // Extracted topics/keywords for context
    aiResponse: boolean("ai_response").default(false),
    automationRuleId: integer("automation_rule_id").references(() => automationRules.id),
    createdAt: timestamp("created_at").defaultNow()
});
// Enhanced conversation context for better AI responses
export const conversationContext = pgTable("conversation_context", {
    id: serial("id").primaryKey(),
    conversationId: integer("conversation_id").references(() => dmConversations.id).notNull(),
    contextType: text("context_type").notNull(), // topic, preference, question, intent
    contextValue: text("context_value").notNull(),
    confidence: integer("confidence").default(100), // 0-100 confidence score
    extractedAt: timestamp("extracted_at").defaultNow(),
    expiresAt: timestamp("expires_at") // For 3-day memory cleanup
});
// AI Thumbnail Generation System - 7 Stage Implementation
export const thumbnailProjects = pgTable("thumbnail_projects", {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id).notNull(),
    workspaceId: integer("workspace_id").references(() => workspaces.id).notNull(),
    title: text("title").notNull(),
    description: text("description"),
    category: text("category").notNull(), // Gaming, Finance, Education, etc.
    uploadedImageUrl: text("uploaded_image_url"),
    status: text("status").default("draft"), // draft, processing, completed, failed
    creditsUsed: integer("credits_used").default(0),
    stage: integer("stage").default(1), // Current stage 1-7
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow()
});
// Stage 2: GPT-4 Strategy Output
export const thumbnailStrategies = pgTable("thumbnail_strategies", {
    id: serial("id").primaryKey(),
    projectId: integer("project_id").references(() => thumbnailProjects.id).notNull(),
    titles: text("titles").array(), // 3 attention-grabbing texts
    ctas: text("ctas").array(), // 2 CTA badge texts
    fonts: text("fonts").array(), // Suggested font families
    colors: json("colors"), // Background, title, CTA colors
    style: text("style").notNull(), // luxury, chaos, mystery, hype
    emotion: text("emotion").notNull(), // shock, success, sadness, urgency
    hooks: text("hooks").array(), // Hook keywords
    placement: text("placement").notNull(), // Layout placement strategy
    createdAt: timestamp("created_at").defaultNow()
});
// Stage 3: Trending Analysis & Visual Matching
export const trendingThumbnails = pgTable("trending_thumbnails", {
    id: serial("id").primaryKey(),
    sourceUrl: text("source_url").notNull(),
    thumbnailUrl: text("thumbnail_url").notNull(),
    title: text("title"),
    category: text("category"),
    viewCount: integer("view_count"),
    engagement: json("engagement"), // likes, comments, shares
    visualFeatures: json("visual_features"), // CLIP/BLIP embeddings
    layoutStyle: text("layout_style"), // Z-pattern-left-face, etc.
    visualMotif: text("visual_motif"), // zoomed face + glow + red stroke
    emojis: text("emojis").array(),
    filters: text("filters").array(),
    scrapedAt: timestamp("scraped_at").defaultNow(),
    isActive: boolean("is_active").default(true)
});
export const thumbnailMatches = pgTable("thumbnail_matches", {
    id: serial("id").primaryKey(),
    projectId: integer("project_id").references(() => thumbnailProjects.id).notNull(),
    trendingThumbnailId: integer("trending_thumbnail_id").references(() => trendingThumbnails.id).notNull(),
    similarity: integer("similarity"), // 0-100 match score
    matchedFeatures: text("matched_features").array(),
    createdAt: timestamp("created_at").defaultNow()
});
// Stage 4: Layout Variants Generation
export const thumbnailVariants = pgTable("thumbnail_variants", {
    id: serial("id").primaryKey(),
    projectId: integer("project_id").references(() => thumbnailProjects.id).notNull(),
    variantNumber: integer("variant_number").notNull(), // 1-5
    layoutType: text("layout_type").notNull(), // Face left text right, Bold title top, etc.
    previewUrl: text("preview_url").notNull(), // PNG preview
    layerMetadata: json("layer_metadata"), // Editable layer data for canvas
    layoutClassification: text("layout_classification"), // High CTR - Emotion + Red
    predictedCtr: integer("predicted_ctr"), // 0-100 predicted CTR score
    composition: json("composition"), // Node.js canvas composition data
    createdAt: timestamp("created_at").defaultNow()
});
// Stage 5: Canvas Editor Sessions
export const canvasEditorSessions = pgTable("canvas_editor_sessions", {
    id: serial("id").primaryKey(),
    variantId: integer("variant_id").references(() => thumbnailVariants.id).notNull(),
    userId: integer("user_id").references(() => users.id).notNull(),
    canvasData: json("canvas_data"), // Fabric.js canvas state
    layers: json("layers"), // Background, face, text, CTA, emojis
    editHistory: json("edit_history"), // Version history
    lastSaved: timestamp("last_saved").defaultNow(),
    isActive: boolean("is_active").default(true),
    createdAt: timestamp("created_at").defaultNow()
});
// Stage 6: Export History
export const thumbnailExports = pgTable("thumbnail_exports", {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id").references(() => canvasEditorSessions.id).notNull(),
    format: text("format").notNull(), // PNG 1280x720, PNG transparent, Instagram 1080x1080, JSON
    exportUrl: text("export_url").notNull(),
    downloadCount: integer("download_count").default(0),
    cloudStorageUrl: text("cloud_storage_url"), // S3/Cloudinary URL
    metadata: json("metadata"), // Additional export metadata
    createdAt: timestamp("created_at").defaultNow()
});
// Advanced Features - Style Library
export const thumbnailStyles = pgTable("thumbnail_styles", {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    styleRules: json("style_rules"), // Emotion-based layout rules
    templateData: json("template_data"), // Reusable template definition
    previewUrl: text("preview_url"),
    popularityScore: integer("popularity_score").default(0),
    isActive: boolean("is_active").default(true),
    createdAt: timestamp("created_at").defaultNow()
});
// Waitlist System for Early Access
export const waitlistUsers = pgTable("waitlist_users", {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    referralCode: text("referral_code").notNull().unique(),
    referredBy: text("referred_by"), // referral code of referrer
    referralCount: integer("referral_count").default(0),
    credits: integer("credits").default(0),
    status: text("status").default("waitlisted"), // waitlisted, early_access, launched
    discountCode: text("discount_code"), // 50% off first month
    discountExpiresAt: timestamp("discount_expires_at"),
    dailyLogins: integer("daily_logins").default(0),
    feedbackSubmitted: boolean("feedback_submitted").default(false),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow()
});
// Insert schemas
export const insertUserSchema = createInsertSchema(users).pick({
    firebaseUid: true,
    email: true,
    username: true,
    displayName: true,
    avatar: true,
    referredBy: true
});
export const insertWorkspaceSchema = createInsertSchema(workspaces).pick({
    userId: true,
    name: true,
    description: true,
    avatar: true,
    theme: true,
    aiPersonality: true,
    isDefault: true
});
export const insertWorkspaceMemberSchema = createInsertSchema(workspaceMembers).pick({
    workspaceId: true,
    userId: true,
    role: true,
    permissions: true,
    invitedBy: true
});
export const insertTeamInvitationSchema = createInsertSchema(teamInvitations).pick({
    workspaceId: true,
    invitedBy: true,
    email: true,
    role: true,
    permissions: true,
    token: true,
    expiresAt: true
});
export const insertSocialAccountSchema = createInsertSchema(socialAccounts).pick({
    workspaceId: true,
    platform: true,
    accountId: true,
    username: true,
    accessToken: true,
    refreshToken: true,
    expiresAt: true
});
export const insertContentSchema = createInsertSchema(content).pick({
    workspaceId: true,
    type: true,
    title: true,
    description: true,
    contentData: true,
    prompt: true,
    platform: true,
    status: true,
    creditsUsed: true,
    scheduledAt: true
}).extend({
    workspaceId: z.union([z.number(), z.string()])
});
export const insertAutomationRuleSchema = createInsertSchema(automationRules).pick({
    workspaceId: true,
    name: true,
    description: true,
    trigger: true,
    action: true,
    isActive: true,
    nextRun: true
});
export const insertAnalyticsSchema = createInsertSchema(analytics).pick({
    workspaceId: true,
    contentId: true,
    platform: true,
    postId: true,
    metrics: true,
    date: true
});
export const insertSuggestionSchema = createInsertSchema(suggestions).pick({
    workspaceId: true,
    type: true,
    data: true,
    confidence: true,
    validUntil: true
});
export const insertCreditTransactionSchema = createInsertSchema(creditTransactions).pick({
    userId: true,
    workspaceId: true,
    type: true,
    amount: true,
    description: true,
    referenceId: true
});
export const insertReferralSchema = createInsertSchema(referrals).pick({
    referrerId: true,
    referredId: true,
    rewardAmount: true
});
export const insertSubscriptionSchema = createInsertSchema(subscriptions).pick({
    userId: true,
    plan: true,
    status: true,
    priceId: true,
    subscriptionId: true,
    currentPeriodStart: true,
    currentPeriodEnd: true,
    trialEnd: true,
    monthlyCredits: true,
    extraCredits: true,
    autoRenew: true
});
export const insertCreditPackageSchema = createInsertSchema(creditPackages).pick({
    name: true,
    credits: true,
    price: true,
    currency: true,
    bonusPercentage: true,
    isActive: true
});
export const insertPaymentSchema = createInsertSchema(payments).pick({
    userId: true,
    razorpayOrderId: true,
    razorpayPaymentId: true,
    razorpaySignature: true,
    amount: true,
    currency: true,
    status: true,
    purpose: true,
    metadata: true
});
export const insertAddonSchema = createInsertSchema(addons).pick({
    userId: true,
    type: true,
    name: true,
    price: true,
    isActive: true,
    expiresAt: true,
    metadata: true
});
export const insertDmConversationSchema = createInsertSchema(dmConversations).pick({
    workspaceId: true,
    platform: true,
    participantId: true,
    participantUsername: true
});
export const insertDmMessageSchema = createInsertSchema(dmMessages).pick({
    conversationId: true,
    messageId: true,
    sender: true,
    content: true,
    messageType: true,
    sentiment: true,
    topics: true,
    aiResponse: true,
    automationRuleId: true
});
export const insertConversationContextSchema = createInsertSchema(conversationContext).pick({
    conversationId: true,
    contextType: true,
    contextValue: true,
    confidence: true,
    expiresAt: true
});
// Thumbnail system insert schemas
export const insertThumbnailProjectSchema = createInsertSchema(thumbnailProjects).pick({
    userId: true,
    workspaceId: true,
    title: true,
    description: true,
    category: true,
    uploadedImageUrl: true,
    status: true,
    stage: true
});
export const insertThumbnailStrategySchema = createInsertSchema(thumbnailStrategies).pick({
    projectId: true,
    titles: true,
    ctas: true,
    fonts: true,
    colors: true,
    style: true,
    emotion: true,
    hooks: true,
    placement: true
});
export const insertTrendingThumbnailSchema = createInsertSchema(trendingThumbnails).pick({
    sourceUrl: true,
    thumbnailUrl: true,
    title: true,
    category: true,
    viewCount: true,
    engagement: true,
    visualFeatures: true,
    layoutStyle: true,
    visualMotif: true,
    emojis: true,
    filters: true,
    isActive: true
});
export const insertThumbnailVariantSchema = createInsertSchema(thumbnailVariants).pick({
    projectId: true,
    variantNumber: true,
    layoutType: true,
    previewUrl: true,
    layerMetadata: true,
    layoutClassification: true,
    predictedCtr: true,
    composition: true
});
export const insertCanvasEditorSessionSchema = createInsertSchema(canvasEditorSessions).pick({
    variantId: true,
    userId: true,
    canvasData: true,
    layers: true,
    editHistory: true,
    isActive: true
});
export const insertThumbnailExportSchema = createInsertSchema(thumbnailExports).pick({
    sessionId: true,
    format: true,
    exportUrl: true,
    cloudStorageUrl: true,
    metadata: true
});
export const insertThumbnailStyleSchema = createInsertSchema(thumbnailStyles).pick({
    name: true,
    category: true,
    styleRules: true,
    templateData: true,
    previewUrl: true,
    popularityScore: true,
    isActive: true
});
// Content recommendations schema
export const insertContentRecommendationSchema = createInsertSchema(contentRecommendations).pick({
    workspaceId: true,
    type: true,
    title: true,
    description: true,
    thumbnailUrl: true,
    mediaUrl: true,
    duration: true,
    category: true,
    country: true,
    tags: true,
    engagement: true,
    sourceUrl: true,
    isActive: true
});
export const insertUserContentHistorySchema = createInsertSchema(userContentHistory).pick({
    userId: true,
    workspaceId: true,
    recommendationId: true,
    action: true,
    metadata: true
});
// Admin Panel Tables
export const admins = pgTable("admins", {
    id: serial("id").primaryKey(),
    email: text("email").notNull().unique(),
    username: text("username").notNull().unique(),
    password: text("password").notNull(),
    role: text("role").default("admin"), // admin, superadmin
    isActive: boolean("is_active").default(true),
    lastLogin: timestamp("last_login"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow()
});
export const adminSessions = pgTable("admin_sessions", {
    id: serial("id").primaryKey(),
    adminId: integer("admin_id").references(() => admins.id).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow()
});
export const notifications = pgTable("notifications", {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id),
    title: text("title").notNull(),
    message: text("message").notNull(),
    type: text("type").default("info"), // info, success, warning, error
    isRead: boolean("is_read").default(false),
    targetUsers: text("target_users").array(), // "all", specific user IDs, or criteria
    scheduledFor: timestamp("scheduled_for"),
    sentAt: timestamp("sent_at"),
    createdAt: timestamp("created_at").defaultNow()
});
export const popups = pgTable("popups", {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    type: text("type").default("announcement"), // announcement, promotion, update
    buttonText: text("button_text"),
    buttonLink: text("button_link"),
    isActive: boolean("is_active").default(true),
    startDate: timestamp("start_date"),
    endDate: timestamp("end_date"),
    targetPages: text("target_pages").array(), // pages where popup should show
    frequency: text("frequency").default("once"), // once, daily, session
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow()
});
export const appSettings = pgTable("app_settings", {
    id: serial("id").primaryKey(),
    key: text("key").notNull().unique(),
    value: text("value").notNull(),
    type: text("type").default("string"), // string, boolean, number, json
    category: text("category").default("general"), // general, features, branding, email
    description: text("description"),
    isPublic: boolean("is_public").default(false), // can be accessed by frontend
    updatedBy: integer("updated_by").references(() => admins.id),
    updatedAt: timestamp("updated_at").defaultNow()
});
export const auditLogs = pgTable("audit_logs", {
    id: serial("id").primaryKey(),
    adminId: integer("admin_id").references(() => admins.id),
    action: text("action").notNull(),
    entity: text("entity"), // user, setting, notification, etc.
    entityId: text("entity_id"),
    oldValues: json("old_values"),
    newValues: json("new_values"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").defaultNow()
});
export const feedbackMessages = pgTable("feedback_messages", {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id),
    subject: text("subject").notNull(),
    message: text("message").notNull(),
    category: text("category").default("general"), // bug, feature, general, billing
    priority: text("priority").default("medium"), // low, medium, high, urgent
    status: text("status").default("open"), // open, in_progress, resolved, closed
    adminNotes: text("admin_notes"),
    assignedTo: integer("assigned_to").references(() => admins.id),
    respondedAt: timestamp("responded_at"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow()
});
// Admin Insert Schemas
export const insertAdminSchema = createInsertSchema(admins).pick({
    email: true,
    username: true,
    password: true,
    role: true,
    isActive: true
});
export const insertAdminSessionSchema = createInsertSchema(adminSessions).pick({
    adminId: true,
    token: true,
    ipAddress: true,
    userAgent: true,
    expiresAt: true
});
export const insertNotificationSchema = createInsertSchema(notifications).pick({
    userId: true,
    title: true,
    message: true,
    type: true,
    targetUsers: true,
    scheduledFor: true
});
export const insertPopupSchema = createInsertSchema(popups).pick({
    title: true,
    content: true,
    type: true,
    buttonText: true,
    buttonLink: true,
    isActive: true,
    startDate: true,
    endDate: true,
    targetPages: true,
    frequency: true
});
export const insertAppSettingSchema = createInsertSchema(appSettings).pick({
    key: true,
    value: true,
    type: true,
    category: true,
    description: true,
    isPublic: true,
    updatedBy: true
});
export const insertAuditLogSchema = createInsertSchema(auditLogs).pick({
    adminId: true,
    action: true,
    entity: true,
    entityId: true,
    oldValues: true,
    newValues: true,
    ipAddress: true,
    userAgent: true
});
export const insertFeedbackMessageSchema = createInsertSchema(feedbackMessages).pick({
    userId: true,
    subject: true,
    message: true,
    category: true,
    priority: true,
    status: true,
    adminNotes: true,
    assignedTo: true
});
// Waitlist Insert Schema
export const insertWaitlistUserSchema = createInsertSchema(waitlistUsers).pick({
    name: true,
    email: true,
    referredBy: true
});
