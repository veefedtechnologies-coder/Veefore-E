/**
 * Legacy plan-shape adapter.
 *
 * The legacy endpoints `/api/subscription/{current,validate-feature,usage}` were
 * built against `server/subscription-config.ts`, whose per-plan object exposes
 * `{ id, name, price, yearlyPrice, credits, features, limits }`. That table has
 * drifted from the canonical `server/config/plan-config.ts`: it defines a
 * 'starter' tier that no longer exists, is missing 'creator' entirely, and
 * reports a 20-credit free allowance where canonical is 50.
 *
 * This module projects the CANONICAL config into that legacy shape so those
 * endpoints stop reporting numbers the rest of the system disagrees with, without
 * changing their response contract.
 *
 * SCOPE — these endpoints are INFORMATIONAL. Real entitlement enforcement is
 * owned by `EntitlementService` + `PLAN_CONFIG` (and the middleware in
 * `server/middleware/entitlement.middleware.ts`). This adapter exists to keep the
 * legacy read surface consistent, not to make access decisions.
 *
 * The legacy feature ids do not map one-to-one onto canonical feature flags, so
 * each is mapped to its closest canonical equivalent below, with the mapping
 * stated explicitly. Where a legacy feature had no canonical counterpart it is
 * gated on "any paid plan", which matches the original intent of its
 * `upgrade: 'starter'` hint (i.e. the first paid tier).
 */

import {
  PLAN_CONFIG,
  isValidPlan,
  getPlanOrder,
  type PlanId,
  type PlanConfig,
} from '../../../config/plan-config';

/** Legacy per-feature descriptor. */
export interface LegacyFeature {
  allowed: boolean;
  /** Numeric cap or a coarse tier label, when the legacy shape carried one. */
  limit?: number | string;
  /** Lowest plan that unlocks this feature, when not allowed. */
  upgrade?: string;
}

/** Legacy plan object shape consumed by the legacy subscription endpoints. */
export interface LegacyPlanView {
  id: string;
  name: string;
  /** Monthly price in RUPEES (canonical stores paise). */
  price: number;
  /** Yearly price in RUPEES. */
  yearlyPrice: number;
  /** Monthly AI credit allowance. -1 = unlimited. */
  credits: number;
  description: string;
  features: Record<string, LegacyFeature>;
  limits: {
    workspaces: number;
    socialAccounts: number;
    scheduledPosts: number;
    teamMembers: number;
    automationRules: number;
    monthlyCredits: number;
  };
}

/** Plans a user can self-serve upgrade to, cheapest first. */
const UPGRADE_LADDER: PlanId[] = ['creator', 'pro', 'business'];

/**
 * Predicate deciding whether a plan unlocks a given legacy feature.
 * Keeping these as functions (rather than a static table) means the answer is
 * always derived from canonical config and cannot drift.
 */
type FeaturePredicate = (plan: PlanConfig) => boolean;

const isPaid: FeaturePredicate = plan => plan.pricing.monthly > 0;

/**
 * Legacy feature id → canonical predicate.
 *
 * Mapping rationale, per entry:
 *   - Features with a direct canonical flag use it.
 *   - Pro-tier legacy features map to a Pro-gated canonical flag.
 *   - Business-tier legacy features map to a Business-gated canonical flag.
 *   - Everything the legacy table gated at the first paid tier uses `isPaid`.
 */
const FEATURE_PREDICATES: Record<string, FeaturePredicate> = {
  // Always available.
  dashboard: () => true,
  'content-scheduler': () => true,
  analytics: () => true,
  workspace: () => true,
  'social-accounts': () => true,

  // First-paid-tier features (legacy `upgrade: 'starter'`).
  'creative-brief': isPaid,
  'content-repurpose': isPaid,
  'trend-calendar': isPaid,
  'user-persona': isPaid,
  'dm-automation': isPaid,

  // Direct canonical equivalents.
  'social-listening': plan => plan.features.socialListening,
  'competitor-analysis': plan => plan.features.advancedSocialListening,
  'advanced-analytics': plan => plan.features.advancedReports,
  'ab-testing': plan => plan.features.advancedReports,
  'roi-calculator': plan => plan.features.advancedReports,
  'emotion-analysis': plan => plan.features.aiAnalyticsInsights,
  'thumbnails-pro': plan => plan.features.aiAnalyticsInsights,

  // Business-tier features — gated on the agency/white-label capability.
  'affiliate-program': plan => plan.features.whiteLabelReports,
  'content-protection': plan => plan.features.whiteLabelReports,
  'legal-assistant': plan => plan.features.whiteLabelReports,
};

/**
 * Lowest self-serve plan that unlocks a feature, or null when no plan does.
 *
 * Computed from canonical config rather than hardcoded. The legacy table
 * hardcoded `upgrade: 'starter'` — a plan that no longer exists — so any client
 * acting on that hint was directing users to an unbuyable tier.
 */
function lowestPlanUnlocking(predicate: FeaturePredicate): string | null {
  const ordered = [...UPGRADE_LADDER].sort(
    (a, b) => getPlanOrder(a) - getPlanOrder(b)
  );
  for (const planId of ordered) {
    if (predicate(PLAN_CONFIG[planId])) return planId;
  }
  return null;
}

/** Coarse per-feature `limit` values the legacy shape exposed. */
function featureLimit(
  featureId: string,
  plan: PlanConfig
): number | string | undefined {
  switch (featureId) {
    case 'content-scheduler':
      return plan.limits.scheduledPostsPerMonth;
    case 'workspace':
      return plan.limits.maxWorkspaces;
    case 'social-accounts':
      return plan.limits.maxProfiles;
    case 'analytics':
      return plan.features.advancedReports ? 'advanced' : 'basic';
    default:
      return undefined;
  }
}

/**
 * Project the canonical config for `planId` into the legacy plan shape.
 * Unknown/legacy plan strings (e.g. the retired 'starter') fall back to Free so
 * callers always receive a usable object instead of `undefined`.
 */
export function getLegacyPlanView(
  planId: string | null | undefined
): LegacyPlanView {
  const resolved: PlanId =
    planId && isValidPlan(planId) ? (planId as PlanId) : 'free';
  const plan = PLAN_CONFIG[resolved];

  const features: Record<string, LegacyFeature> = {};
  for (const [featureId, predicate] of Object.entries(FEATURE_PREDICATES)) {
    const allowed = predicate(plan);
    const limit = featureLimit(featureId, plan);
    const entry: LegacyFeature = { allowed };
    if (limit !== undefined) entry.limit = limit;
    if (!allowed) {
      const upgrade = lowestPlanUnlocking(predicate);
      if (upgrade) entry.upgrade = upgrade;
    }
    features[featureId] = entry;
  }

  return {
    id: plan.id,
    name: plan.name,
    price: plan.pricing.monthly / 100, // paise → rupees
    yearlyPrice: plan.pricing.yearly / 100,
    credits: plan.limits.aiCreditsPerMonth,
    description: `${plan.name} plan`,
    features,
    limits: {
      workspaces: plan.limits.maxWorkspaces,
      socialAccounts: plan.limits.maxProfiles,
      scheduledPosts: plan.limits.scheduledPostsPerMonth,
      teamMembers: plan.limits.maxTeamMembers,
      automationRules: plan.limits.workflowLimit,
      monthlyCredits: plan.limits.aiCreditsPerMonth,
    },
  };
}
