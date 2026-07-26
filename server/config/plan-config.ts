/**
 * Plan Config — Single Source of Truth
 *
 * This file mirrors Veefore_Subscription_Plans_v1.md exactly.
 * NO other file may contain plan numeric values or pricing.
 *
 * Satisfies Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9,
 *                         17.6, 18.6
 */

// ---------------------------------------------------------------------------
// Core type definitions
// ---------------------------------------------------------------------------

/** The five supported subscription tiers. */
export type PlanId = 'free' | 'creator' | 'pro' | 'business' | 'enterprise';

/** Monthly or yearly billing cadence. */
export type BillingCycle = 'monthly' | 'yearly';

/** Three capability tiers for the VeeGPT AI assistant. */
export type VeeGPTTier = 'basic' | 'full' | 'advanced';

/**
 * All numeric quota limits for a plan.
 * -1 represents "unlimited" (used for enterprise and certain pro/business fields).
 */
export interface PlanLimits {
  /** Maximum workspaces allowed. -1 = unlimited. */
  maxWorkspaces: number;
  /** Maximum social profiles across all workspaces. -1 = unlimited. */
  maxProfiles: number;
  /** Maximum team members (seat count). -1 = unlimited. */
  maxTeamMembers: number;
  /** Maximum scheduled posts per month. -1 = unlimited. */
  scheduledPostsPerMonth: number;
  /** Analytics history window in days. -1 = unlimited. */
  analyticsHistoryDays: number;
  /** Base AI credits allocated per billing cycle. -1 = custom/unlimited. */
  aiCreditsPerMonth: number;
  /** Maximum concurrent automation workflows. -1 = unlimited. */
  workflowLimit: number;
  /** Maximum concurrent AI-driven workflows. -1 = unlimited. */
  aiWorkflowLimit: number;
  /** Maximum keyword triggers configured. -1 = unlimited. */
  keywordTriggerLimit: number;
  /** Maximum keyword trigger conversations per month. -1 = unlimited. */
  keywordTriggerConversationsPerMonth: number;
  /** Maximum AI-powered conversations per month. -1 = unlimited. */
  aiConversationsPerMonth: number;
  /** Maximum follow-to-unlock campaign conversations per month. -1 = unlimited. */
  followCampaignConversationsPerMonth: number;
}

/**
 * Boolean feature flags and tiered capability values for a plan.
 */
export interface PlanFeatures {
  /** Allows scheduling multiple posts at once. */
  bulkScheduling: boolean;
  /** Allows saving posts as drafts (Creator plan and above). */
  draftPosts: boolean;
  /** Allows creation of custom analytics dashboards. */
  customDashboards: boolean;
  /** Enables advanced analytics reports. */
  advancedReports: boolean;
  /** Enables white-label PDF/report exports (agency feature). */
  whiteLabelReports: boolean;
  /** Enables client-facing report sharing. */
  clientReporting: boolean;
  /** Cross-platform analytics dashboards — Executive/Reach/Engagement (Creator+). */
  crossPlatformAnalytics: boolean;
  /** Audience insights dashboard (Creator+). */
  audienceInsights: boolean;
  /** Content performance dashboard (Creator+). */
  contentPerformance: boolean;
  /** AI analytics insights dashboard (Pro+). */
  aiAnalyticsInsights: boolean;
  /** Advanced automation insights (Pro+). */
  advancedAutomationInsights: boolean;
  /** Enables programmatic API access to Veefore data. */
  apiAccess: boolean;
  /** Enables post approval workflow for team accounts. */
  approvalWorkflow: boolean;
  /** Enables multi-step AI-driven conversation journeys. */
  multiStepJourneys: boolean;
  /** Enables smart conditional logic in automation builders. */
  smartLogicBuilder: boolean;
  /** Enables basic social listening (brand monitoring, mentions). */
  socialListening: boolean;
  /** Enables advanced social listening (sentiment, competitor, trends). */
  advancedSocialListening: boolean;
  /** Enables Single Sign-On (enterprise only). */
  sso: boolean;
  /** The VeeGPT capability tier available to this plan. */
  veeGPTLevel: VeeGPTTier;
  /** Recommendation depth available to this plan. */
  aiRecommendationsLevel: 'basic' | 'standard' | 'advanced';
  /**
   * Analytics export capability.
   * 'watermarked_pdf' — free tier, exports carry a Veefore watermark.
   * 'full'            — paid tiers, export to PDF/Excel/CSV/PowerPoint.
   */
  analyticsExport: 'watermarked_pdf' | 'full';
}

/**
 * Monthly and yearly subscription prices in INR paise (1 INR = 100 paise).
 * 0 means free / custom pricing.
 */
export interface PlanPricing {
  /** Price per month in paise. */
  monthly: number;
  /** Price per year in paise. */
  yearly: number;
}

/** Complete plan definition combining id, name, pricing, limits, and features. */
export interface PlanConfig {
  id: PlanId;
  name: string;
  pricing: PlanPricing;
  limits: PlanLimits;
  features: PlanFeatures;
}

// ---------------------------------------------------------------------------
// Add-on type definitions
// ---------------------------------------------------------------------------

/**
 * All purchasable add-on types.
 * Recurring add-ons extend limits month-to-month.
 * One-time add-ons (ai_credits_*) add to purchasedCredits.
 */
export type AddOnType =
  | 'extra_workspace'
  | 'extra_team_member'
  | 'extra_profiles'
  | 'ai_credits_500'
  | 'ai_credits_2000'
  | 'ai_credits_5000'
  | 'ai_conversations_500'
  | 'keyword_conversations_1000'
  | 'follow_campaign_500'
  | 'white_label_reports'
  | 'api_access'
  | 'priority_support';

/**
 * Definition of a single purchasable add-on.
 */
export interface AddOnDefinition {
  /** Unique add-on identifier. */
  type: AddOnType;
  /** Human-readable display name. */
  name: string;
  /**
   * Monthly recurring price in paise.
   * null means this is a one-time purchase (see priceOneTime).
   */
  priceMonthly: number | null;
  /**
   * One-time purchase price in paise.
   * null means this is a recurring monthly subscription.
   */
  priceOneTime: number | null;
  /**
   * The amount added to the relevant limit per unit purchased.
   * e.g. extra_profiles adds 10 profiles per quantity=1.
   */
  quantityIncrement: number;
  /**
   * Which limit key this add-on affects.
   * 'purchasedCredits' is a special key on the AICredits document.
   */
  limitKey: keyof PlanLimits | 'purchasedCredits';
  /**
   * Minimum plan required to purchase this add-on.
   * undefined = available to all plans including free.
   */
  requiredMinPlan?: PlanId;
}

// ---------------------------------------------------------------------------
// Credit cost type definition
// ---------------------------------------------------------------------------

/**
 * Maps each AI feature to the number of AI credits it consumes per invocation.
 */
export type AICreditFeature =
  | 'captionGeneration'
  | 'hashtagGeneration'
  | 'performanceBanner'
  | 'aiRewrite'
  | 'imageGeneration'
  | 'aiGrowthRecommendation'
  | 'aiContentPlan'
  | 'aiAnalyticsInsight'
  | 'aiBusinessInsight'
  | 'automationDm'
  | 'automationComment'
  | 'videoScript'

export interface DynamicCreditRule {
  floor: number;
  /** Normal pre-call reservation estimate; measured overages are never undercharged. */
  ceiling: number;
  mode: 'dynamic' | 'fixed';
}

/** Reservation ceilings retained for route-guard compatibility. */
export interface CreditCostMap {
  captionGeneration: number;
  hashtagGeneration: number;
  bannerGeneration: number;
  imageGeneration: number;
  aiRewrite: number;
  veeGPTMessage: number;
  aiGrowthRecommendation: number;
  aiContentPlan: number;
  aiAnalyticsInsight: number;
  aiBusinessInsight: number;
}

// ---------------------------------------------------------------------------
// PLAN_CONFIG — the single source of truth for all plan values
// Values mirror Veefore_Subscription_Plans_v1.md exactly.
// ---------------------------------------------------------------------------

export const PLAN_CONFIG: Record<PlanId, PlanConfig> = {

  // -------------------------------------------------------------------------
  // Free — ₹0/month
  // Requirement 1.3
  // -------------------------------------------------------------------------
  free: {
    id: 'free',
    name: 'Free',
    pricing: {
      monthly: 0,
      yearly: 0,
    },
    limits: {
      maxWorkspaces: 1,
      maxProfiles: 6,
      maxTeamMembers: 1,
      scheduledPostsPerMonth: 30,
      analyticsHistoryDays: 30,
      aiCreditsPerMonth: 50,
      workflowLimit: 1,
      aiWorkflowLimit: 1,
      keywordTriggerLimit: 3,
      keywordTriggerConversationsPerMonth: 50,
      aiConversationsPerMonth: 30,
      followCampaignConversationsPerMonth: 0,
    },
    features: {
      bulkScheduling: false,
      draftPosts: false,
      customDashboards: false,
      advancedReports: false,
      whiteLabelReports: false,
      clientReporting: false,
      crossPlatformAnalytics: false,
      audienceInsights: false,
      contentPerformance: false,
      aiAnalyticsInsights: false,
      advancedAutomationInsights: false,
      apiAccess: false,
      approvalWorkflow: false,
      multiStepJourneys: false,
      smartLogicBuilder: false,
      socialListening: false,
      advancedSocialListening: false,
      sso: false,
      veeGPTLevel: 'basic',
      aiRecommendationsLevel: 'basic',
      analyticsExport: 'watermarked_pdf',
    },
  },

  // -------------------------------------------------------------------------
  // Creator — ₹799/month | ₹7,999/year
  // Requirement 1.4
  // -------------------------------------------------------------------------
  creator: {
    id: 'creator',
    name: 'Creator',
    pricing: {
      monthly: 79900,   // ₹799 in paise
      yearly: 799900,   // ₹7,999 in paise
    },
    limits: {
      maxWorkspaces: 2,
      maxProfiles: 15,
      maxTeamMembers: 1,
      scheduledPostsPerMonth: 80,       // 80 scheduled posts / month
      analyticsHistoryDays: 365,        // 1 year
      aiCreditsPerMonth: 500,
      workflowLimit: 5,
      aiWorkflowLimit: 5,
      keywordTriggerLimit: 20,
      keywordTriggerConversationsPerMonth: 500,
      aiConversationsPerMonth: 300,
      followCampaignConversationsPerMonth: 100,
    },
    features: {
      bulkScheduling: true,
      draftPosts: true,
      customDashboards: false,
      advancedReports: false,
      whiteLabelReports: false,
      clientReporting: false,
      crossPlatformAnalytics: true,
      audienceInsights: true,
      contentPerformance: true,
      aiAnalyticsInsights: false,
      advancedAutomationInsights: false,
      apiAccess: false,
      approvalWorkflow: false,
      multiStepJourneys: false,
      smartLogicBuilder: false,
      socialListening: true,
      advancedSocialListening: false,
      sso: false,
      veeGPTLevel: 'full',
      aiRecommendationsLevel: 'standard',
      analyticsExport: 'full',
    },
  },

  // -------------------------------------------------------------------------
  // Pro — ₹1,999/month | ₹19,999/year
  // Requirement 1.5
  // -------------------------------------------------------------------------
  pro: {
    id: 'pro',
    name: 'Pro',
    pricing: {
      monthly: 199900,    // ₹1,999 in paise
      yearly: 1999900,    // ₹19,999 in paise
    },
    limits: {
      maxWorkspaces: 5,
      maxProfiles: 75,
      maxTeamMembers: 5,
      scheduledPostsPerMonth: 80,       // "Everything in Creator" → 80 / month
      analyticsHistoryDays: 730,        // 2 years
      aiCreditsPerMonth: 2000,
      workflowLimit: -1,                // unlimited
      aiWorkflowLimit: -1,              // unlimited
      keywordTriggerLimit: -1,          // unlimited
      keywordTriggerConversationsPerMonth: 5000,
      aiConversationsPerMonth: 3000,
      followCampaignConversationsPerMonth: 1000,
    },
    features: {
      bulkScheduling: true,
      draftPosts: true,
      customDashboards: true,
      advancedReports: true,
      whiteLabelReports: false,
      clientReporting: false,
      crossPlatformAnalytics: true,
      audienceInsights: true,
      contentPerformance: true,
      aiAnalyticsInsights: true,
      advancedAutomationInsights: true,
      apiAccess: false,
      approvalWorkflow: false,
      multiStepJourneys: true,
      smartLogicBuilder: true,
      socialListening: true,
      advancedSocialListening: true,
      sso: false,
      veeGPTLevel: 'advanced',
      aiRecommendationsLevel: 'advanced',
      analyticsExport: 'full',
    },
  },

  // -------------------------------------------------------------------------
  // Business — ₹4,999/month | ₹49,999/year
  // Requirement 1.6
  // -------------------------------------------------------------------------
  business: {
    id: 'business',
    name: 'Business',
    pricing: {
      monthly: 499900,    // ₹4,999 in paise
      yearly: 4999900,    // ₹49,999 in paise
    },
    limits: {
      maxWorkspaces: 20,
      maxProfiles: 300,
      maxTeamMembers: 20,
      scheduledPostsPerMonth: -1,       // unlimited
      analyticsHistoryDays: 730,        // 2 years (same as pro)
      aiCreditsPerMonth: 5000,
      workflowLimit: -1,                // unlimited
      aiWorkflowLimit: -1,              // unlimited
      keywordTriggerLimit: -1,          // unlimited
      keywordTriggerConversationsPerMonth: 50000,
      aiConversationsPerMonth: 30000,
      followCampaignConversationsPerMonth: 10000,
    },
    features: {
      bulkScheduling: true,
      draftPosts: true,
      customDashboards: true,
      advancedReports: true,
      whiteLabelReports: true,
      clientReporting: true,
      crossPlatformAnalytics: true,
      audienceInsights: true,
      contentPerformance: true,
      aiAnalyticsInsights: true,
      advancedAutomationInsights: true,
      apiAccess: false,
      approvalWorkflow: true,
      multiStepJourneys: true,
      smartLogicBuilder: true,
      socialListening: true,
      advancedSocialListening: true,
      sso: false,
      veeGPTLevel: 'advanced',
      aiRecommendationsLevel: 'advanced',
      analyticsExport: 'full',
    },
  },

  // -------------------------------------------------------------------------
  // Enterprise — Custom pricing
  // All numeric limits are -1 (unlimited). Requirement 1.7
  // -------------------------------------------------------------------------
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    pricing: {
      monthly: 0,   // placeholder — custom pricing negotiated off-platform
      yearly: 0,    // placeholder
    },
    limits: {
      maxWorkspaces: -1,
      maxProfiles: -1,
      maxTeamMembers: -1,
      scheduledPostsPerMonth: -1,
      analyticsHistoryDays: -1,
      aiCreditsPerMonth: -1,
      workflowLimit: -1,
      aiWorkflowLimit: -1,
      keywordTriggerLimit: -1,
      keywordTriggerConversationsPerMonth: -1,
      aiConversationsPerMonth: -1,
      followCampaignConversationsPerMonth: -1,
    },
    features: {
      bulkScheduling: true,
      draftPosts: true,
      customDashboards: true,
      advancedReports: true,
      whiteLabelReports: true,
      clientReporting: true,
      crossPlatformAnalytics: true,
      audienceInsights: true,
      contentPerformance: true,
      aiAnalyticsInsights: true,
      advancedAutomationInsights: true,
      apiAccess: true,
      approvalWorkflow: true,
      multiStepJourneys: true,
      smartLogicBuilder: true,
      socialListening: true,
      advancedSocialListening: true,
      sso: true,
      veeGPTLevel: 'advanced',
      aiRecommendationsLevel: 'advanced',
      analyticsExport: 'full',
    },
  },
};

// ---------------------------------------------------------------------------
// ADDON_CONFIG — all 12 purchasable add-ons
// Prices in INR paise. Requirement 8.1
// ---------------------------------------------------------------------------

export const ADDON_CONFIG: Record<AddOnType, AddOnDefinition> = {

  // Workspace add-ons
  extra_workspace: {
    type: 'extra_workspace',
    name: 'Extra Workspace',
    priceMonthly: 29900,   // ₹299/month
    priceOneTime: null,
    quantityIncrement: 1,
    limitKey: 'maxWorkspaces',
    requiredMinPlan: undefined,
  },

  // Team add-ons
  extra_team_member: {
    type: 'extra_team_member',
    name: 'Extra Team Member',
    priceMonthly: 19900,   // ₹199/month
    priceOneTime: null,
    quantityIncrement: 1,
    limitKey: 'maxTeamMembers',
    requiredMinPlan: undefined,
  },

  // Profile add-ons
  extra_profiles: {
    type: 'extra_profiles',
    name: 'Extra 10 Profiles',
    priceMonthly: 19900,   // ₹199/month
    priceOneTime: null,
    quantityIncrement: 10,
    limitKey: 'maxProfiles',
    requiredMinPlan: undefined,
  },

  // AI Credits — one-time packs
  ai_credits_500: {
    type: 'ai_credits_500',
    name: 'AI Credits — 500 Pack',
    priceMonthly: null,
    priceOneTime: 29900,   // ₹299 one-time
    quantityIncrement: 500,
    limitKey: 'purchasedCredits',
    requiredMinPlan: undefined,
  },

  ai_credits_2000: {
    type: 'ai_credits_2000',
    name: 'AI Credits — 2,000 Pack',
    priceMonthly: null,
    priceOneTime: 89900,   // ₹899 one-time
    quantityIncrement: 2000,
    limitKey: 'purchasedCredits',
    requiredMinPlan: undefined,
  },

  ai_credits_5000: {
    type: 'ai_credits_5000',
    name: 'AI Credits — 5,000 Pack',
    priceMonthly: null,
    priceOneTime: 199900,  // ₹1,999 one-time
    quantityIncrement: 5000,
    limitKey: 'purchasedCredits',
    requiredMinPlan: undefined,
  },

  // Automation conversation add-ons
  ai_conversations_500: {
    type: 'ai_conversations_500',
    name: '+500 AI-Powered Conversations',
    priceMonthly: 29900,   // ₹299/month
    priceOneTime: null,
    quantityIncrement: 500,
    limitKey: 'aiConversationsPerMonth',
    requiredMinPlan: undefined,
  },

  keyword_conversations_1000: {
    type: 'keyword_conversations_1000',
    name: '+1,000 Keyword Trigger Conversations',
    priceMonthly: 29900,   // ₹299/month
    priceOneTime: null,
    quantityIncrement: 1000,
    limitKey: 'keywordTriggerConversationsPerMonth',
    requiredMinPlan: undefined,
  },

  follow_campaign_500: {
    type: 'follow_campaign_500',
    name: '+500 Follow Campaign Conversations',
    priceMonthly: 19900,   // ₹199/month
    priceOneTime: null,
    quantityIncrement: 500,
    limitKey: 'followCampaignConversationsPerMonth',
    requiredMinPlan: 'creator',   // requires Creator or above
  },

  // Premium feature add-ons (toggle feature flags — quantityIncrement = 1)
  white_label_reports: {
    type: 'white_label_reports',
    name: 'White-label Reports',
    priceMonthly: 49900,   // ₹499/month
    priceOneTime: null,
    quantityIncrement: 1,
    limitKey: 'maxWorkspaces',    // feature flag add-on; limitKey unused for feature toggles
    requiredMinPlan: 'business',  // requires Business or above
  },

  api_access: {
    type: 'api_access',
    name: 'API Access',
    priceMonthly: 99900,   // ₹999/month
    priceOneTime: null,
    quantityIncrement: 1,
    limitKey: 'maxWorkspaces',    // feature flag add-on; limitKey unused for feature toggles
    requiredMinPlan: 'creator',   // available from Creator plan
  },

  priority_support: {
    type: 'priority_support',
    name: 'Priority Support',
    priceMonthly: 49900,   // ₹499/month
    priceOneTime: null,
    quantityIncrement: 1,
    limitKey: 'maxWorkspaces',    // feature flag add-on; limitKey unused for feature toggles
    requiredMinPlan: undefined,
  },
};

// ---------------------------------------------------------------------------
// Dynamic AI credit model
// ---------------------------------------------------------------------------

/** Maximum provider cost (INR) represented by one credit. */
export const CREDIT_COST_BUDGET_INR = 0.60
/** Minimum cost-recovery multiplier applied before the operation floor. */
export const AI_COST_MARGIN_TARGET = 1.5
/** Background Performance Overview / recommendation charges per workspace/month. */
export const AUTO_INSIGHT_MONTHLY_CHARGE_CAP = 20

export const CREDIT_MODEL: Record<AICreditFeature, DynamicCreditRule> = {
  captionGeneration: { floor: 0.5, ceiling: 2, mode: 'dynamic' },
  hashtagGeneration: { floor: 0.3, ceiling: 1, mode: 'dynamic' },
  performanceBanner: { floor: 0.2, ceiling: 0.5, mode: 'dynamic' },
  aiRewrite: { floor: 0.5, ceiling: 2, mode: 'dynamic' },
  imageGeneration: { floor: 8, ceiling: 14, mode: 'dynamic' },
  aiGrowthRecommendation: { floor: 1, ceiling: 3, mode: 'dynamic' },
  aiContentPlan: { floor: 1, ceiling: 3, mode: 'dynamic' },
  aiAnalyticsInsight: { floor: 0.5, ceiling: 2, mode: 'dynamic' },
  aiBusinessInsight: { floor: 1, ceiling: 3, mode: 'dynamic' },
  automationDm: { floor: 0.3, ceiling: 0.3, mode: 'fixed' },
  automationComment: { floor: 0.3, ceiling: 0.3, mode: 'fixed' },
  videoScript: { floor: 2, ceiling: 5, mode: 'dynamic' },
}

/**
 * Pre-call reservation ceilings. VeeGPT conversation itself is free; only its
 * caption/hashtag tools invoke the corresponding metered feature.
 */
export const CREDIT_COSTS: CreditCostMap = {
  captionGeneration: CREDIT_MODEL.captionGeneration.ceiling,
  hashtagGeneration: CREDIT_MODEL.hashtagGeneration.ceiling,
  bannerGeneration: CREDIT_MODEL.performanceBanner.ceiling,
  imageGeneration: CREDIT_MODEL.imageGeneration.ceiling,
  aiRewrite: CREDIT_MODEL.aiRewrite.ceiling,
  veeGPTMessage: 0,
  aiGrowthRecommendation: CREDIT_MODEL.aiGrowthRecommendation.ceiling,
  aiContentPlan: CREDIT_MODEL.aiContentPlan.ceiling,
  aiAnalyticsInsight: CREDIT_MODEL.aiAnalyticsInsight.ceiling,
  aiBusinessInsight: CREDIT_MODEL.aiBusinessInsight.ceiling,
};

// ---------------------------------------------------------------------------
// Helper functions — Requirement 1.8, 1.9
// ---------------------------------------------------------------------------

/**
 * Ordered list of plan IDs from lowest to highest tier.
 * Used by getPlanOrder() and middleware plan comparisons.
 */
const PLAN_ORDER: PlanId[] = ['free', 'creator', 'pro', 'business', 'enterprise'];

/**
 * Returns the full PlanConfig for the given planId.
 * Returns null if the planId is not a recognized plan — callers must handle
 * the null case and respond with HTTP 400 (Requirement 1.8).
 *
 * @param planId - The plan identifier string to look up.
 */
export function getPlanConfig(planId: string): PlanConfig | null {
  if (!isValidPlan(planId)) {
    return null;
  }
  return PLAN_CONFIG[planId];
}

/**
 * Returns the ordinal position of a plan in the tier hierarchy.
 * free=0, creator=1, pro=2, business=3, enterprise=4.
 * Used by requirePlan() middleware to compare plan tiers.
 *
 * @param planId - A validated PlanId.
 */
export function getPlanOrder(planId: PlanId): number {
  return PLAN_ORDER.indexOf(planId);
}

/**
 * Type guard that checks whether an arbitrary string is a valid PlanId.
 * Use this before calling getPlanOrder or accessing PLAN_CONFIG directly.
 *
 * @param id - The string to validate.
 */
export function isValidPlan(id: string): id is PlanId {
  return PLAN_ORDER.includes(id as PlanId);
}
