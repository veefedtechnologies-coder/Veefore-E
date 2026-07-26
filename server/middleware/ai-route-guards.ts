/**
 * AI Route Guards — Composable Middleware Chains
 *
 * Provides pre-built guard combinations for every AI-powered, automation,
 * team, and feature-gated route in the application. Route files import from
 * here instead of constructing middleware chains inline, ensuring a single
 * source of truth for all entitlement policies.
 *
 * AI credit guards reserve each operation's dynamic ceiling. The successful
 * operation later settles its actual measured charge; failed calls cost zero.
 * Plain VeeGPT conversation is free.
 *
 * Satisfies Requirements: 16.2
 */

import {
  requireSubscription,
  requireCredits,
  requirePlan,
  requireFeature,
  requireAutomationLimit,
  requireProfileLimit,
} from '../middleware/entitlement.middleware'
import { CREDIT_COSTS } from '../config/plan-config'

// ---------------------------------------------------------------------------
// AI Content Generation Guards
// ---------------------------------------------------------------------------

/**
 * Caption generation: active subscription + 1 AI credit.
 * Available on all paid plans.
 */
export const captionGenerationGuards = [
  requireSubscription(),
  requireCredits(CREDIT_COSTS.captionGeneration),
]

/**
 * Hashtag generation: active subscription + 1 AI credit.
 * Available on all paid plans.
 */
export const hashtagGenerationGuards = [
  requireSubscription(),
  requireCredits(CREDIT_COSTS.hashtagGeneration),
]

/**
 * Banner generation: active subscription + 2 AI credits.
 * Available on all paid plans.
 */
export const performanceBannerGuards = [
  requireSubscription(),
  requireCredits(CREDIT_COSTS.bannerGeneration),
]

/**
 * AI image generation is separate from the Performance Overview banner.
 */
export const imageGenerationGuards = [
  requireSubscription(),
  requireCredits(CREDIT_COSTS.imageGeneration),
]

/**
 * AI rewrite: active subscription + Creator plan minimum + 2 AI credits.
 * Requires Creator plan or higher.
 */
export const aiRewriteGuards = [
  requireSubscription(),
  requirePlan('creator'),
  requireCredits(CREDIT_COSTS.aiRewrite),
]

// ---------------------------------------------------------------------------
// VeeGPT Guards
// ---------------------------------------------------------------------------

/**
 * VeeGPT basic tier: active subscription only.
 * Available on Free plan (basic VeeGPT access).
 */
export const veeGPTBasicGuards = [
  requireSubscription(),
]

/**
 * VeeGPT full tier: active subscription + Creator plan minimum + 1 AI credit.
 * Requires Creator plan (veeGPTLevel: 'full').
 */
export const veeGPTFullGuards = [
  requireSubscription(),
  requirePlan('creator'),
  requireCredits(CREDIT_COSTS.veeGPTMessage),
]

/**
 * VeeGPT advanced tier: active subscription + Pro plan minimum + 1 AI credit.
 * Requires Pro plan (veeGPTLevel: 'advanced').
 */
export const veeGPTAdvancedGuards = [
  requireSubscription(),
  requirePlan('pro'),
  requireCredits(CREDIT_COSTS.veeGPTMessage),
]

// ---------------------------------------------------------------------------
// AI Analytics & Growth Guards
// ---------------------------------------------------------------------------

/**
 * AI recommendations: available on every plan. Free receives the bounded
 * Basic tier; Creator receives standard recommendations; Pro+ receives the
 * advanced growth tier. Generation still requires canonical AI credits.
 */
export const growthRecommendationGuards = [
  requireSubscription(),
  requireCredits(CREDIT_COSTS.aiGrowthRecommendation),
]

/**
 * Content plan generation: active subscription + Pro plan minimum + 3 AI credits.
 * Requires Pro plan or higher.
 */
export const contentPlanGuards = [
  requireSubscription(),
  requirePlan('pro'),
  requireCredits(CREDIT_COSTS.aiContentPlan),
]

/**
 * Analytics insights: active subscription + Pro plan minimum + 2 AI credits.
 * Requires Pro plan or higher.
 */
export const analyticsInsightGuards = [
  requireSubscription(),
  requirePlan('pro'),
  requireCredits(CREDIT_COSTS.aiAnalyticsInsight),
]

/**
 * Business insights: active subscription + Business plan minimum + 3 AI credits.
 * Requires Business plan or higher.
 */
export const businessInsightGuards = [
  requireSubscription(),
  requirePlan('business'),
  requireCredits(CREDIT_COSTS.aiBusinessInsight),
]

// ---------------------------------------------------------------------------
// Automation Guards
// ---------------------------------------------------------------------------

/**
 * Automation workflows: active subscription + automation feature flag
 * + workflow count within plan limit.
 */
export const automationGuards = [
  requireSubscription(),
  requireFeature('automation' as any),
  requireAutomationLimit('workflows'),
]

// ---------------------------------------------------------------------------
// Agency / White-label Feature Guards
// ---------------------------------------------------------------------------

/**
 * White-label reports: active subscription + whiteLabelReports feature flag.
 * Requires Business plan or the white_label_reports add-on.
 */
export const whiteLabelReportsGuards = [
  requireSubscription(),
  requireFeature('whiteLabelReports'),
]

/**
 * API access: active subscription + apiAccess feature flag.
 * Requires Enterprise plan or the api_access add-on.
 */
export const apiAccessGuards = [
  requireSubscription(),
  requireFeature('apiAccess'),
]

// ---------------------------------------------------------------------------
// Bulk Scheduling & Team Guards
// ---------------------------------------------------------------------------

/**
 * Bulk scheduling: active subscription + bulkScheduling feature flag
 * + social profile count within plan limit.
 */
export const bulkSchedulingGuards = [
  requireSubscription(),
  requireFeature('bulkScheduling'),
  requireProfileLimit(),
]

/**
 * Team member invite: active subscription + team member count within plan limit.
 */
export const teamInviteGuards = [
  requireSubscription(),
  requireAutomationLimit('teamMembers'),
]
