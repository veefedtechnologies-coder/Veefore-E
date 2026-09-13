/**
 * VeeGPT tier gating — single source of truth for which chat tools each tier
 * (basic / full / advanced) may use. Mirrors Veefore_VeeGPT_Feature_Matrix_v1.md
 * and the plan doc (features.veeGPTLevel: Free=basic, Creator=full,
 * Pro/Business/Enterprise=advanced).
 *
 * The server filters the tool arrays offered to the model by tier, so a lower
 * plan can never invoke a higher-tier tool — even on a hand-crafted request.
 */

import type { VeeGPTTier } from './plan-config'

export type { VeeGPTTier }

const TIER_ORDER: Record<VeeGPTTier, number> = { basic: 0, full: 1, advanced: 2 }

/**
 * Minimum tier required for each VeeGPT tool (by function name). Tools not
 * listed default to Basic (available to everyone). Keep this exhaustive for all
 * tools defined in server/routes/veegpt-tools.ts.
 */
export const TOOL_MIN_TIER: Record<string, VeeGPTTier> = {
  // ── Basic (Free) ──────────────────────────────────────────────────────────
  remember_fact: 'basic',
  update_memory: 'basic',
  forget_memory: 'basic',
  get_workspace_data: 'basic',
  generate_caption: 'basic',
  generate_hashtags: 'basic',
  generate_document: 'basic',
  get_best_posting_time: 'basic',
  // Image generation/editing are Creator+ (Full) — a costly native capability.
  generate_image: 'full',
  edit_image: 'full',
  // AI Video Editor is Creator+ (Full) — matches the image capability tier; the
  // edit itself runs async through the video-editor pipeline (metered there).
  video_editor: 'full',

  // ── Full (Creator+) ─────────────────────────────────────────────────────── 
  schedule_post: 'full',
  show_media_options: 'full',
  reschedule_post: 'full',
  cancel_scheduled_post: 'full',
  update_post_caption: 'full',
  delete_post: 'full',
  duplicate_post: 'full',
  get_account_details: 'full',
  search_web: 'full',
  research_trends: 'full',
  get_analytics_insight: 'full',

  // ── Deep research: available to EVERY tier, but bounded per plan ──────────
  // It used to be Advanced-only (Pro+). Free and Creator now get a small monthly
  // PREVIEW (see monthlyCapByPlan for veegpt.deep_research: ≈1 and ≈2 jobs) so
  // they can experience it and upgrade. The hard tier gate is removed; the
  // per-plan VGU feature cap is the single enforcement point, and a spent
  // allowance returns FEATURE_QUOTA_EXHAUSTED with an upgrade prompt.
  deep_research: 'basic',
}

/** True when `tier` is at least `min` in the basic < full < advanced order. */
export function tierAtLeast(tier: VeeGPTTier, min: VeeGPTTier): boolean {
  return TIER_ORDER[tier] >= TIER_ORDER[min]
}

/** Whether a given tool is allowed for the tier. Unknown tools default allowed. */
export function isToolAllowedForTier(toolName: string, tier: VeeGPTTier): boolean {
  const min = TOOL_MIN_TIER[toolName]
  if (!min) return true
  return tierAtLeast(tier, min)
}

/**
 * Filter a list of ChatTool-like objects (each has `.function.name`) down to the
 * ones the tier may use.
 */
export function filterToolsByTier<T extends { function?: { name?: string } }>(
  tools: T[],
  tier: VeeGPTTier,
): T[] {
  return tools.filter((t) => {
    const name = t?.function?.name
    return name ? isToolAllowedForTier(name, tier) : true
  })
}

/**
 * Resolve the VeeGPT tier for a user from their plan. Falls back to 'basic' on
 * any error so access is never accidentally over-granted.
 */
export async function resolveVeeGPTTier(userId?: string): Promise<VeeGPTTier> {
  if (!userId) return 'basic'
  try {
    const { getEntitlementService } = await import('../features/subscription/services/EntitlementService')
    const { getRedisClient } = await import('../lib/redis')
    const SubscriptionRepository = (await import('../features/subscription/db/repositories/SubscriptionRepository')).default
    const { PLAN_CONFIG } = await import('./plan-config')

    const service = getEntitlementService(getRedisClient(), new SubscriptionRepository())
    const plan = await service.getPlan(userId)
    return (PLAN_CONFIG[plan]?.features?.veeGPTLevel ?? 'basic') as VeeGPTTier
  } catch {
    return 'basic'
  }
}

/** Human label for the minimum plan that unlocks a tier (for upgrade hints). */
export const TIER_MIN_PLAN: Record<VeeGPTTier, string> = {
  basic: 'Free',
  full: 'Creator',
  advanced: 'Pro',
}
