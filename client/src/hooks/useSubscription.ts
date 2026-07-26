/**
 * useSubscription — fetches the authenticated user's subscription state from
 * GET /api/v2/subscription/me and exposes plan, status, limits, usage, AI
 * credits, and add-ons for UI rendering.
 *
 * This hook is intentionally data-only.  All access-control decisions are made
 * on the server.  The frontend renders whatever the server returns and shows the
 * UpgradeDialog when a 403 with an `upgradeHint` is received.
 *
 * staleTime is set to 30 s to match the server-side 30 s Redis cache on the
 * /api/v2/subscription/me endpoint.
 */

import { useQuery } from '@tanstack/react-query';
import { ApiClient } from '@/lib/api';
import { SUBSCRIPTION_QUERY_KEY } from '@/lib/queryClient';

// ---------------------------------------------------------------------------
// Response types — mirror the server's SubscriptionMeResponse shape
// ---------------------------------------------------------------------------

export interface SubscriptionFeatures {
  bulkScheduling: boolean;
  draftPosts: boolean;
  customDashboards: boolean;
  advancedReports: boolean;
  whiteLabelReports: boolean;
  clientReporting: boolean;
  crossPlatformAnalytics: boolean;
  audienceInsights: boolean;
  contentPerformance: boolean;
  aiAnalyticsInsights: boolean;
  advancedAutomationInsights: boolean;
  apiAccess: boolean;
  approvalWorkflow: boolean;
  multiStepJourneys: boolean;
  smartLogicBuilder: boolean;
  socialListening: boolean;
  advancedSocialListening: boolean;
  sso: boolean;
  veeGPTLevel: 'basic' | 'full' | 'advanced';
  aiRecommendationsLevel: 'basic' | 'standard' | 'advanced';
  analyticsExport: 'watermarked_pdf' | 'full';
}

export interface SubscriptionLimits {
  maxWorkspaces: number;
  maxProfiles: number;
  maxTeamMembers: number;
  analyticsHistoryDays: number;
  scheduledPostsPerMonth: number;
  aiCreditsPerMonth: number;
  workflowLimit: number;
  aiWorkflowLimit: number;
  keywordTriggerLimit: number;
  keywordTriggerConversationsPerMonth: number;
  aiConversationsPerMonth: number;
  followCampaignConversationsPerMonth: number;
  features: SubscriptionFeatures;
}

export interface SubscriptionUsage {
  workspacesUsed: number;
  profilesUsed: number;
  teamMembersUsed: number;
  scheduledPostsThisCycle: number;
  keywordConversationsThisCycle: number;
  aiConversationsThisCycle: number;
  followCampaignConversationsThisCycle: number;
}

export interface AICreditsInfo {
  remaining: number;
  monthly: number;
  purchased: number;
  usedThisCycle: number;
  nextResetAt: string | null;
}

export interface AddOnView {
  addOnId: string;
  type: string;
  quantity: number;
  status: string;
  currentPeriodEnd: string | null;
}

export interface SubscriptionMeResponse {
  plan: string;
  billingCycle: string;
  status: string;
  currentPeriodEnd: string | null;
  nextBillingDate: string | null;
  cancelAtPeriodEnd: boolean;
  limits: SubscriptionLimits;
  usage: SubscriptionUsage;
  aiCredits: AICreditsInfo;
  addOns: AddOnView[];
}

// ---------------------------------------------------------------------------
// UpgradeHint — the shape returned by the server in 403 responses
// ---------------------------------------------------------------------------

/**
 * Upgrade hint shape returned by every server 403 when a quota or feature is
 * exceeded.  Used by UpgradeDialog — never constructed client-side.
 */
export interface UpgradeHint {
  reason: string;
  currentLimit: number | string;
  nextPlan: string;
  nextPlanLimit: number | string;
  upgradeUrl: string;
}

// ---------------------------------------------------------------------------
// isNearQuota helper
// ---------------------------------------------------------------------------

/**
 * Returns `true` when `used` is at or above 80 % of `limit`.
 * A `limit` of -1 means unlimited — always returns `false`.
 */
export function isNearQuota(used: number, limit: number): boolean {
  if (limit === -1 || limit === 0) return false;
  return used / limit >= 0.8;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseSubscriptionReturn {
  plan: string | undefined;
  status: string | undefined;
  limits: SubscriptionLimits | undefined;
  usage: SubscriptionUsage | undefined;
  aiCredits: AICreditsInfo | undefined;
  addOns: AddOnView[] | undefined;
  cancelAtPeriodEnd: boolean | undefined;
  currentPeriodEnd: string | null | undefined;
  nextBillingDate: string | null | undefined;
  billingCycle: string | undefined;
  isLoading: boolean;
  error: Error | null;
}

async function fetchSubscriptionMe(): Promise<SubscriptionMeResponse> {
  const data = await ApiClient.get('/api/v2/subscription/me');
  // The server wraps responses in { success, data } — unwrap if needed
  if (data && typeof data === 'object' && 'data' in data) {
    return data.data as SubscriptionMeResponse;
  }
  return data as SubscriptionMeResponse;
}

export default function useSubscription(): UseSubscriptionReturn {
  const { data, isLoading, error } = useQuery<SubscriptionMeResponse, Error>({
    queryKey: SUBSCRIPTION_QUERY_KEY,
    queryFn: fetchSubscriptionMe,
    staleTime: 30_000, // 30 s — matches server-side Redis cache TTL
    retry: 1,
    refetchOnWindowFocus: false,
    // No WebSocket: successful AI responses update this cache immediately, and
    // this lightweight poll reconciles background/legacy deductions.
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });

  return {
    plan: data?.plan,
    status: data?.status,
    limits: data?.limits,
    usage: data?.usage,
    aiCredits: data?.aiCredits,
    addOns: data?.addOns,
    cancelAtPeriodEnd: data?.cancelAtPeriodEnd,
    currentPeriodEnd: data?.currentPeriodEnd,
    nextBillingDate: data?.nextBillingDate,
    billingCycle: data?.billingCycle,
    isLoading,
    error: error ?? null,
  };
}
