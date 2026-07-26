/**
 * Analytics entitlements — maps each analytics dashboard/section to the
 * subscription feature that unlocks it, per Veefore_Subscription_Plans_v1.md.
 *
 * Built-in dashboards NOT listed here (overview, publishing, best-time, reports)
 * are available on all plans — Free gets the "Basic Analytics Dashboard".
 * Gating here mirrors the server guard (dashboardEntitlementGuard) so the UI and
 * API agree; the server remains authoritative.
 */

import type { SubscriptionFeatures } from '@/hooks/useSubscription'

/** Feature required to access a dashboard, keyed by its dashboard/nav id. */
export const DASHBOARD_REQUIRED_FEATURE: Record<string, keyof SubscriptionFeatures> = {
  // Reach & Engagement are deeper views of the cross-platform metrics the free
  // Overview already shows (combined FB + Instagram under the "All" filter), so
  // they stay available on all plans. Executive remains the gated cross-platform
  // roll-up.
  executive: 'crossPlatformAnalytics',
  audience: 'audienceInsights',
  content: 'contentPerformance',
  insights: 'aiAnalyticsInsights',
  builder: 'customDashboards',
  custom: 'customDashboards',
}

/** Minimum plan name shown in upgrade prompts, keyed by required feature. */
export const FEATURE_MIN_PLAN: Record<keyof SubscriptionFeatures, string> = {
  bulkScheduling: 'Creator',
  draftPosts: 'Creator',
  crossPlatformAnalytics: 'Creator',
  audienceInsights: 'Creator',
  contentPerformance: 'Creator',
  customDashboards: 'Pro',
  advancedReports: 'Pro',
  aiAnalyticsInsights: 'Pro',
  advancedAutomationInsights: 'Pro',
  whiteLabelReports: 'Business',
  clientReporting: 'Business',
  apiAccess: 'Enterprise',
  approvalWorkflow: 'Business',
  multiStepJourneys: 'Pro',
  smartLogicBuilder: 'Pro',
  socialListening: 'Creator',
  advancedSocialListening: 'Pro',
  sso: 'Enterprise',
  veeGPTLevel: 'Creator',
  aiRecommendationsLevel: 'Creator',
  analyticsExport: 'Creator',
}

/**
 * Given the plan's feature flags, decide whether a dashboard id is accessible.
 * While features are still loading (`features` undefined) we return `true` so
 * paying users don't see an upgrade flash; the server still enforces access.
 */
export function canAccessDashboard(
  dashboardId: string,
  features: SubscriptionFeatures | undefined
): boolean {
  const required = DASHBOARD_REQUIRED_FEATURE[dashboardId]
  if (!required) return true
  if (!features) return true
  return features[required] === true
}
