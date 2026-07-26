/**
 * EntitlementService
 *
 * The single authority for all access-control decisions in Veefore.
 * Reads plan and add-on data from MongoDB, caches in Redis at a 60-second TTL,
 * and exposes typed methods consumed by the middleware stack.
 *
 * Cache key:  sub:entitlement:{userId}
 * TTL:        60 seconds
 *
 * Enterprise bypass: any userId on the 'enterprise' plan receives Infinity
 * for all numeric limits without further checks.
 *
 * featureOverrides: ISubscription.featureOverrides (Map<string, boolean>)
 * is consulted FIRST before plan defaults for canUseFeature().
 *
 * Satisfies Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 5.3
 */

import mongoose, { Schema } from 'mongoose'
import { type Redis } from 'ioredis'
import {
  PLAN_CONFIG,
  ADDON_CONFIG,
  getPlanConfig,
  getPlanOrder,
  type PlanId,
  type PlanLimits,
  type PlanFeatures,
} from '../../../config/plan-config'
import SubscriptionRepository from '../db/repositories/SubscriptionRepository'
import { AddOnModel } from '../db/models/AddOnModel'
import AICreditsModel from '../db/models/AICreditsModel'
import { AICreditsRepository, type DeductResult } from '../db/repositories/AICreditsRepository'
import { quotaNotifier } from './QuotaNotifier'
import logger from '../../../config/logger'

// ---------------------------------------------------------------------------
// AutomationType
// ---------------------------------------------------------------------------

/**
 * Automation quota dimensions that can be queried via remainingAutomation().
 */
export type AutomationType =
  | 'keywordConversations'
  | 'aiConversations'
  | 'followCampaignConversations'
  | 'workflows'
  | 'aiWorkflows'
  | 'keywordTriggers'
  | 'teamMembers'

// ---------------------------------------------------------------------------
// UsageCounterModel — inline Mongoose model for automation / conversation usage
// ---------------------------------------------------------------------------

interface IUsageCounter {
  userId: string
  type: AutomationType
  countThisCycle: number
  lastResetAt: Date
}

const UsageCounterSchema = new Schema<IUsageCounter>(
  {
    userId: { type: String, required: true },
    type: { type: String, required: true },
    countThisCycle: { type: Number, required: true, default: 0 },
    lastResetAt: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: false }
)

UsageCounterSchema.index({ userId: 1, type: 1 }, { unique: true })

export const UsageCounterModel =
  (mongoose.models.UsageCounter as mongoose.Model<IUsageCounter>) ||
  mongoose.model<IUsageCounter>('UsageCounter', UsageCounterSchema)

// ---------------------------------------------------------------------------
// Exported interfaces (consumed by middleware and controllers)
// ---------------------------------------------------------------------------

/**
 * Merged effective limits for a user — base plan limits with all active add-ons
 * applied, plus the plan's feature flags. This is what gets stored in Redis.
 */
export interface EffectiveLimits extends PlanLimits {
  /** Full feature flag set for the user's current plan. */
  features: PlanFeatures
}

/**
 * Result returned by canUseFeature(). When `allowed` is false, `upgradeHint`
 * provides everything the frontend needs to render the upgrade dialog.
 */
export interface EntitlementResult {
  allowed: boolean
  reason?: string
  currentPlan: PlanId
  requiredPlan?: PlanId
  upgradeHint?: UpgradeHint
}

/**
 * Upgrade prompt data included in denial responses.
 * The frontend renders this directly — no hardcoded plan values on the client.
 */
export interface UpgradeHint {
  reason: string
  currentLimit: number | string
  nextPlan: PlanId
  nextPlanLimit: number | string
  upgradeUrl: string
}

// ---------------------------------------------------------------------------
// Re-export DeductResult so callers don't need to import from the repository
// ---------------------------------------------------------------------------
export type { DeductResult }

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

const CACHE_KEY_PREFIX = 'sub:entitlement:'
const CACHE_TTL_SECONDS = 60

/** Ordered plan tiers, lowest → highest. */
const PLAN_ORDER: PlanId[] = ['free', 'creator', 'pro', 'business', 'enterprise']

// ---------------------------------------------------------------------------
// EntitlementService
// ---------------------------------------------------------------------------

export class EntitlementService {
  constructor(
    private readonly redis: Redis,
    private readonly subscriptionRepo: SubscriptionRepository
  ) {}

  // -------------------------------------------------------------------------
  // Public API — plan resolution
  // -------------------------------------------------------------------------

  /**
   * Returns the user's current PlanId by reading from the Subscription document.
   * NEVER reads from JWT claims.
   * Returns 'free' if no Subscription document exists.
   *
   * Requirement 5.3 — payment_failed grace period:
   * If status is 'payment_failed' AND gracePeriodEndsAt is set AND that date
   * has already passed, the user is treated as 'free' regardless of their
   * stored plan field.
   *
   * Mirrors the same grace-period logic for the newer Razorpay 'past_due'
   * status + pastDueGraceEndsAt field (renewal-retry grace period).
   */
  async getPlan(userId: string): Promise<PlanId> {
    const subscription = await this.subscriptionRepo.findByUserId(userId)

    if (!subscription) {
      logger.debug('No subscription found, defaulting to free', { userId, module: 'EntitlementService' })
      return 'free'
    }

    // SECURITY: Only return a paid plan when the subscription is actually active or in trial.
    // Statuses 'started', 'cancelled', 'expired', 'inactive' all revert to 'free'.
    const paidStatuses = ['active', 'trial']
    if (!paidStatuses.includes(subscription.status)) {
      // payment_failed within grace period still counts as paid
      if (
        subscription.status === 'payment_failed' &&
        subscription.gracePeriodEndsAt != null &&
        subscription.gracePeriodEndsAt >= new Date()
      ) {
        return subscription.plan as PlanId
      }
      if (subscription.status === 'payment_failed') {
        logger.info(
          'Grace period expired — downgrading to free plan',
          { userId, gracePeriodEndsAt: subscription.gracePeriodEndsAt, module: 'EntitlementService' }
        )
      }
      // past_due (Razorpay renewal failure) within grace period still counts as paid
      if (
        subscription.status === 'past_due' &&
        subscription.pastDueGraceEndsAt != null &&
        subscription.pastDueGraceEndsAt >= new Date()
      ) {
        return subscription.plan as PlanId
      }
      if (subscription.status === 'past_due') {
        logger.info(
          'past_due grace period expired — downgrading to free plan',
          { userId, pastDueGraceEndsAt: subscription.pastDueGraceEndsAt, module: 'EntitlementService' }
        )
      }
      return 'free'
    }

    return subscription.plan as PlanId
  }

  /**
   * Returns the fully merged EffectiveLimits for the user, combining base plan
   * limits with all ACTIVE add-ons. Result is cached in Redis for 60 seconds.
   *
   * Requirement 5.3 — payment_failed grace period:
   * If status is 'payment_failed' AND gracePeriodEndsAt is set AND that date
   * has already passed, effective limits are computed from the 'free' plan
   * regardless of the stored plan field.
   *
   * Mirrors the same grace-period logic for the newer Razorpay 'past_due'
   * status + pastDueGraceEndsAt field (renewal-retry grace period).
   */
  async getEffectiveLimits(userId: string): Promise<EffectiveLimits> {
    // 1. Try cache first
    const cached = await this.getCached(userId)
    if (cached) {
      logger.debug('Cache hit for effective limits', { userId, module: 'EntitlementService' })
      return cached
    }

    // 2. Cache miss — compute from DB
    logger.debug('Cache miss, computing effective limits from DB', { userId, module: 'EntitlementService' })

    const [subscription, activeAddOns] = await Promise.all([
      this.subscriptionRepo.findByUserId(userId),
      AddOnModel.find({ userId, status: 'active' }).lean(),
    ])

    // Requirement 5.3: payment_failed with expired grace period → use free plan limits
    // SECURITY: Only grant paid plan limits when status is 'active' or 'trial'.
    // Any other status (started, cancelled, expired, payment_failed, inactive) → free.
    let planId: PlanId = 'free'
    if (subscription) {
      const paidStatuses = ['active', 'trial']
      if (paidStatuses.includes(subscription.status)) {
        planId = (subscription.plan as PlanId) ?? 'free'
      }
      // payment_failed within grace period still gets paid limits
      if (
        subscription.status === 'payment_failed' &&
        subscription.gracePeriodEndsAt != null &&
        subscription.gracePeriodEndsAt >= new Date()
      ) {
        planId = (subscription.plan as PlanId) ?? 'free'
      }
      // payment_failed with expired grace period → free (already handled above by defaulting to free)
      if (
        subscription.status === 'payment_failed' &&
        subscription.gracePeriodEndsAt != null &&
        subscription.gracePeriodEndsAt < new Date()
      ) {
        logger.info(
          'Grace period expired — effective limits computed from free plan',
          { userId, gracePeriodEndsAt: subscription.gracePeriodEndsAt, module: 'EntitlementService' }
        )
        planId = 'free'
      }
      // past_due (Razorpay renewal failure) within grace period still gets paid limits
      if (
        subscription.status === 'past_due' &&
        subscription.pastDueGraceEndsAt != null &&
        subscription.pastDueGraceEndsAt >= new Date()
      ) {
        planId = (subscription.plan as PlanId) ?? 'free'
      }
      // past_due with expired grace period → free (already handled above by defaulting to free)
      if (
        subscription.status === 'past_due' &&
        subscription.pastDueGraceEndsAt != null &&
        subscription.pastDueGraceEndsAt < new Date()
      ) {
        logger.info(
          'past_due grace period expired — effective limits computed from free plan',
          { userId, pastDueGraceEndsAt: subscription.pastDueGraceEndsAt, module: 'EntitlementService' }
        )
        planId = 'free'
      }
    }

    const planConfig = getPlanConfig(planId)

    if (!planConfig) {
      // Defensive: should never happen with a valid PlanId
      logger.error('Unknown planId — falling back to free', undefined, { userId, planId, module: 'EntitlementService' })
      const freeConfig = PLAN_CONFIG['free']
      const fallback: EffectiveLimits = { ...freeConfig.limits, features: freeConfig.features }
      await this.setCached(userId, fallback)
      return fallback
    }

    // Start with the base plan limits (spread to avoid mutation)
    const effectiveLimits: EffectiveLimits = {
      ...planConfig.limits,
      features: { ...planConfig.features },
    }

    // 3. Merge active add-ons that affect numeric limits
    // Add-ons with limitKey === 'purchasedCredits' affect AICredits doc, not plan limits.
    // Feature-toggle add-ons (white_label_reports, api_access, priority_support) have
    // limitKey set to 'maxWorkspaces' as a placeholder — we skip those here and handle
    // feature flags via canUseFeature() + featureOverrides only.
    for (const addOn of activeAddOns) {
      const { type, quantity } = addOn

      // Look up the add-on definition
      const addonDef = ADDON_CONFIG[type as keyof typeof ADDON_CONFIG]

      if (!addonDef) {
        logger.warn('Unknown add-on type in DB, skipping', { userId, type, module: 'EntitlementService' })
        continue
      }

      const { limitKey, quantityIncrement } = addonDef

      // Skip non-limit add-ons (purchasedCredits is on AICredits doc, not here)
      if (limitKey === 'purchasedCredits') continue

      // Skip feature-toggle add-ons whose limitKey is a placeholder
      // (white_label_reports / api_access / priority_support use maxWorkspaces as placeholder)
      if (['white_label_reports', 'api_access', 'priority_support'].includes(type)) continue

      // Only increment if the plan limit is not already -1 (enterprise unlimited)
      const currentValue = effectiveLimits[limitKey as keyof PlanLimits] as number
      if (currentValue !== -1) {
        (effectiveLimits as unknown as Record<string, number>)[limitKey as string] =
          currentValue + quantity * quantityIncrement
      }
    }

    // 4. Cache and return
    await this.setCached(userId, effectiveLimits)
    return effectiveLimits
  }

  /**
   * Returns the numeric limit for a specific limit key.
   * Returns Infinity if the stored value is -1 (enterprise unlimited).
   */
  async getLimit(userId: string, limitKey: keyof PlanLimits): Promise<number> {
    const limits = await this.getEffectiveLimits(userId)
    const raw = limits[limitKey] as number
    return raw === -1 ? Infinity : raw
  }

  /**
   * Checks whether the user can use a given feature.
   *
   * Resolution order:
   *  1. ISubscription.featureOverrides (admin overrides) — if key is present, use it.
   *  2. Plan defaults from EffectiveLimits.features.
   *
   * Returns EntitlementResult with upgradeHint when denied.
   */
  async canUseFeature(
    userId: string,
    featureKey: keyof PlanFeatures
  ): Promise<EntitlementResult> {
    const planId = await this.getPlan(userId)
    const limits = await this.getEffectiveLimits(userId)

    // 1. Check featureOverrides on the Subscription document
    const subscription = await this.subscriptionRepo.findByUserId(userId)
    if (subscription?.featureOverrides) {
      const overrideMap = subscription.featureOverrides as Map<string, boolean>
      if (overrideMap instanceof Map && overrideMap.has(featureKey)) {
        const overrideValue = overrideMap.get(featureKey)!
        logger.debug(
          'Feature resolved via admin override',
          { userId, featureKey, overrideValue, module: 'EntitlementService' }
        )
        return {
          allowed: overrideValue,
          currentPlan: planId,
          reason: overrideValue ? undefined : `Feature '${featureKey}' is disabled by admin override`,
        }
      }
      // Also handle plain object (lean() returns objects, not Maps)
      const overrideObj = overrideMap as unknown as Record<string, boolean>
      if (typeof overrideObj === 'object' && featureKey in overrideObj) {
        const overrideValue = overrideObj[featureKey]
        logger.debug(
          'Feature resolved via admin override (plain object)',
          { userId, featureKey, overrideValue, module: 'EntitlementService' }
        )
        return {
          allowed: overrideValue,
          currentPlan: planId,
          reason: overrideValue ? undefined : `Feature '${featureKey}' is disabled by admin override`,
        }
      }
    }

    // 2. Check plan features
    const featureValue = limits.features[featureKey]

    // Boolean features
    if (typeof featureValue === 'boolean') {
      if (featureValue) {
        return { allowed: true, currentPlan: planId }
      }

      // Denied — find the next plan that provides this feature
      const upgradeHint = this.buildFeatureUpgradeHint(featureKey, planId)

      logger.info(
        'Feature access denied — plan does not include feature',
        { userId, featureKey, planId, module: 'EntitlementService' }
      )

      return {
        allowed: false,
        currentPlan: planId,
        reason: `Your ${planId} plan does not include '${featureKey}'. Upgrade to access this feature.`,
        requiredPlan: upgradeHint?.nextPlan,
        upgradeHint,
      }
    }

    // Non-boolean feature values (veeGPTLevel, analyticsExport) — always allowed
    // but the value itself indicates the tier. We return allowed: true so callers
    // can read the value from EffectiveLimits directly if they need the tier.
    return { allowed: true, currentPlan: planId }
  }

  /**
   * Deletes the Redis cache entry for the user, forcing the next read to
   * recompute from MongoDB. Call immediately after any subscription or add-on change.
   */
  async invalidateCache(userId: string): Promise<void> {
    const key = this.cacheKey(userId)
    await this.redis.del(key)
    logger.debug('Entitlement cache invalidated', { userId, key, module: 'EntitlementService' })
  }

  // -------------------------------------------------------------------------
  // Credit queries / mutations
  // -------------------------------------------------------------------------

  async ensureCreditAccount(userId: string) {
    const plan = await this.getPlan(userId)
    if (plan === 'enterprise') return null
    const allocation = PLAN_CONFIG[plan].limits.aiCreditsPerMonth
    const repo = new AICreditsRepository()
    const existing = await repo.findByUserId(userId)
    const now = new Date()
    const nextResetAt = new Date(now)
    nextResetAt.setUTCMonth(nextResetAt.getUTCMonth() + 1)

    if (!existing) return repo.ensureForUser(userId, allocation, nextResetAt)

    // Reconcile legacy/free documents immediately: older code allocated 100
    // Free credits. The repository performs this atomically from current DB
    // values so concurrent deductions cannot be overwritten, while purchased
    // and rollover balances remain untouched.
    if (plan === 'free' && existing.monthlyCredits !== allocation) {
      const reconciled = await repo.reconcileMonthlyAllocation(userId, allocation)
      return reconciled ?? repo.findByUserId(userId)
    }

    // Free users may have no Subscription document, so the subscription cron
    // cannot discover them. Compare-and-set on nextResetAt ensures concurrent
    // reads cannot replenish the same cycle twice or erase a deduction.
    if (existing.nextResetAt <= now) {
      const reset = await repo.resetMonthly(userId, allocation, nextResetAt, now)
      return reset ?? repo.findByUserId(userId)
    }
    return existing
  }

  /**
   * Returns the canonical available balance. A missing account is initialized
   * from the effective plan (Free users receive exactly 50 credits).
   */
  async remainingCredits(userId: string): Promise<number> {
    const plan = await this.getPlan(userId)
    if (plan === 'enterprise') return Infinity
    const doc = await this.ensureCreditAccount(userId)
    return Math.max(0, doc?.remainingCredits ?? 0)
  }

  /**
   * Atomically deduct `amount` AI credits from the user's balance.
   *
   * Delegates to AICreditsRepository.deductCredits(), then fires quota
   * threshold notifications (80 / 90 / 100%) via QuotaNotifier.
   *
   * @param userId - Target user.
   * @param amount - Number of credits to consume (must be > 0).
   * @returns DeductResult — { success, remaining } on success,
   *          { success: false, reason: 'insufficient_credits', remaining } on failure.
   */
  async deductCredits(userId: string, amount: number, idempotencyKey?: string): Promise<DeductResult> {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Credit deduction amount must be a positive finite number')
    }
    await this.ensureCreditAccount(userId)
    const normalizedAmount = Math.round((amount + Number.EPSILON) * 100) / 100
    const repo = new AICreditsRepository()
    const result = await repo.deductCredits(userId, normalizedAmount, 3, idempotencyKey)

    if (result.success) {
      // Notifications are a non-critical side effect. A notifier failure must
      // never make callers believe the debit failed after MongoDB committed it.
      try {
        const updatedDoc = await AICreditsModel.findOne({ userId }).lean()
        if (updatedDoc) {
          await quotaNotifier.checkAndNotify(
            userId,
            'ai_credits',
            updatedDoc.usedThisCycle,
            updatedDoc.usedThisCycle + updatedDoc.remainingCredits,
            this.redis
          )
        }
      } catch (notificationError) {
        logger.warn('AI credit quota notification failed after successful debit', {
          userId,
          module: 'EntitlementService',
          error: notificationError instanceof Error ? notificationError.message : String(notificationError),
        })
      }
    }

    return result
  }

  // -------------------------------------------------------------------------
  // Automation / quota remaining
  // -------------------------------------------------------------------------

  /**
   * Returns the number of remaining quota units for the given automation type.
   *
   * For count-based types (conversations), current usage is read from the
   * UsageCounterModel. For limit-based types (workflows, triggers, seats),
   * usage is not separately tracked — the effective limit is returned as-is
   * (callers are responsible for counting active records elsewhere).
   *
   * Returns Infinity if the plan limit is unlimited (-1).
   * Returns minimum 0 — never negative.
   */
  async remainingAutomation(userId: string, type: AutomationType): Promise<number> {
    const limitKeyMap: Record<AutomationType, keyof PlanLimits> = {
      keywordConversations: 'keywordTriggerConversationsPerMonth',
      aiConversations: 'aiConversationsPerMonth',
      followCampaignConversations: 'followCampaignConversationsPerMonth',
      workflows: 'workflowLimit',
      aiWorkflows: 'aiWorkflowLimit',
      keywordTriggers: 'keywordTriggerLimit',
      teamMembers: 'maxTeamMembers',
    }

    const limitKey = limitKeyMap[type]
    const limit = await this.getLimit(userId, limitKey)

    if (limit === Infinity) {
      return Infinity
    }

    // For conversation-based types, read cycle usage from UsageCounterModel
    const conversationTypes: AutomationType[] = [
      'keywordConversations',
      'aiConversations',
      'followCampaignConversations',
    ]

    if (conversationTypes.includes(type)) {
      const counter = await UsageCounterModel.findOne({ userId, type }).lean()
      const used = counter?.countThisCycle ?? 0
      return Math.max(0, limit - used)
    }

    // For non-conversation types (workflows, triggers, seats) — return the limit
    // since active counts are managed by their respective domain collections
    return limit
  }

  // -------------------------------------------------------------------------
  // Resource remaining counts
  // -------------------------------------------------------------------------

  /**
   * Resolves the set of workspace IDs actually owned by this user, using the
   * SAME resolution path as the real workspace switcher UI
   * (WorkspaceController.getUserWorkspaces → WorkspaceService.getWorkspacesByUserId,
   * which queries WorkspaceModel by `ownerId`, trying the user's Firebase UID
   * first and falling back to their Mongo _id).
   *
   * IMPORTANT: `userId` here may be either a Mongo _id string (the normal case
   * for authenticated requests) or already a Firebase UID (edge-case fallback
   * users created directly from a decoded token). Both are tried so this never
   * silently resolves to an empty set for a user who actually has workspaces.
   *
   * This is the single source of truth for "how many workspaces does this user
   * have" used by all usage counters and limit checks below — it deliberately
   * does NOT read the legacy `workspaces` collection directly, because that
   * collection can contain orphaned/duplicate records that never appear in the
   * UI (see: workspace count mismatches between billing usage and the actual
   * workspace switcher).
   */
  private async resolveWorkspaceIds(userId: string): Promise<string[]> {
    try {
      const { User } = await import('../../../models/User/User')
      const { workspaceService } = await import('../../../services/WorkspaceService')

      const userDoc = await User.findById(userId).select('firebaseUid').lean().catch(() => null)
      const firebaseUid = (userDoc as any)?.firebaseUid as string | undefined

      let workspaces = firebaseUid
        ? await workspaceService.getWorkspacesByUserId(firebaseUid)
        : []

      if (!workspaces || workspaces.length === 0) {
        workspaces = await workspaceService.getWorkspacesByUserId(userId)
      }

      return (workspaces || []).map((w: any) => String(w._id ?? w.id))
    } catch (err) {
      logger.warn('resolveWorkspaceIds failed, defaulting to empty list', {
        userId,
        err: (err as Error)?.message,
        module: 'EntitlementService',
      })
      return []
    }
  }

  /**
   * Returns the number of additional social profiles the user can connect.
   *
   * Resolves the user's real workspace IDs first, then counts documents in the
   * `socialaccounts` collection (the actual collection name — SocialAccount has
   * no top-level `userId` field, only `workspaceId`) scoped to those workspaces.
   */
  async remainingProfiles(userId: string): Promise<number> {
    const limit = await this.getLimit(userId, 'maxProfiles')
    if (limit === Infinity) return Infinity

    const workspaceIds = await this.resolveWorkspaceIds(userId)
    if (workspaceIds.length === 0) return limit

    const count = await mongoose.connection
      .collection('socialaccounts')
      .countDocuments({ workspaceId: { $in: workspaceIds } })

    return Math.max(0, limit - count)
  }

  /**
   * Returns the number of additional workspaces the user can create.
   *
   * Uses resolveWorkspaceIds() so this always matches what the workspace
   * switcher UI actually shows the user.
   */
  async remainingWorkspaces(userId: string): Promise<number> {
    const limit = await this.getLimit(userId, 'maxWorkspaces')
    if (limit === Infinity) return Infinity

    const workspaceIds = await this.resolveWorkspaceIds(userId)
    return Math.max(0, limit - workspaceIds.length)
  }

  /**
   * Returns usage counters for the /me endpoint: workspaces, social profiles,
   * team members, and scheduled posts this billing cycle. All are resolved
   * from the user's real workspace IDs so they stay consistent with what the
   * app's UI (workspace switcher, connected accounts, calendar) actually shows.
   */
  async getUsageCounts(userId: string): Promise<{
    workspacesUsed: number
    profilesUsed: number
    teamMembersUsed: number
    scheduledPostsThisCycle: number
  }> {
    const workspaceIds = await this.resolveWorkspaceIds(userId)

    if (workspaceIds.length === 0) {
      return { workspacesUsed: 0, profilesUsed: 0, teamMembersUsed: 0, scheduledPostsThisCycle: 0 }
    }

    const now = new Date()
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    // Strict upper bound: posts scheduled for a FUTURE month must not be charged
    // to the current month's quota. Window is [startOfMonth, startOfNextMonth).
    const startOfNextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
    const objectIds = workspaceIds
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id))

    const [profilesUsed, teamMembersUsed, scheduledPostsThisCycle] = await Promise.all([
      mongoose.connection
        .collection('socialaccounts')
        .countDocuments({ workspaceId: { $in: workspaceIds } }),
      mongoose.connection
        .collection('workspacemembers')
        .countDocuments({ workspaceId: { $in: objectIds } })
        .catch(() => 0),
      mongoose.connection
        .collection('contents')
        .countDocuments({ workspaceId: { $in: workspaceIds }, scheduledAt: { $gte: startOfMonth, $lt: startOfNextMonth } }),
    ])

    return {
      workspacesUsed: workspaceIds.length,
      profilesUsed,
      teamMembersUsed,
      scheduledPostsThisCycle,
    }
  }

  /**
   * Returns the number of additional posts the user can schedule for the given
   * month (defaults to the current calendar month).
   *
   * Resolves the user's real workspace IDs, then counts `contents` documents
   * (Content model has no top-level `userId`, only `workspaceId`) whose
   * scheduledAt falls in the target month's strict window
   * [startOfMonth, startOfNextMonth), scoped to those workspaces.
   *
   * @param reference Any Date inside the month to measure. Defaults to now.
   */
  async remainingPosts(userId: string, reference: Date = new Date()): Promise<number> {
    const limit = await this.getLimit(userId, 'scheduledPostsPerMonth')
    if (limit === Infinity) return Infinity

    const workspaceIds = await this.resolveWorkspaceIds(userId)
    if (workspaceIds.length === 0) return limit

    const startOfMonth = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1))
    const startOfNextMonth = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() + 1, 1))

    const count = await mongoose.connection
      .collection('contents')
      .countDocuments({ workspaceId: { $in: workspaceIds }, scheduledAt: { $gte: startOfMonth, $lt: startOfNextMonth } })

    return Math.max(0, limit - count)
  }

  /**
   * Returns the user's effective keywordTriggerLimit.
   *
   * Active keyword trigger counts are managed by the keyword trigger domain.
   * This method returns the plan limit so callers can enforce it at creation time.
   *
   * Returns Infinity for unlimited plans.
   */
  async remainingKeywords(userId: string): Promise<number> {
    return this.getLimit(userId, 'keywordTriggerLimit')
  }

  /**
   * Returns remaining follow-campaign conversations for this billing cycle.
   *
   * Delegates to remainingAutomation for consistent usage tracking.
   */
  async remainingFollowCampaigns(userId: string): Promise<number> {
    return this.remainingAutomation(userId, 'followCampaignConversations')
  }

  // -------------------------------------------------------------------------
  // Private cache helpers
  // -------------------------------------------------------------------------

  private cacheKey(userId: string): string {
    return `${CACHE_KEY_PREFIX}${userId}`
  }

  private async getCached(userId: string): Promise<EffectiveLimits | null> {
    try {
      const raw = await this.redis.get(this.cacheKey(userId))
      if (!raw) return null
      return JSON.parse(raw) as EffectiveLimits
    } catch (err) {
      logger.warn('Redis cache read failed, falling back to DB', { userId, err, module: 'EntitlementService' })
      return null
    }
  }

  private async setCached(userId: string, data: EffectiveLimits): Promise<void> {
    try {
      await this.redis.set(
        this.cacheKey(userId),
        JSON.stringify(data),
        'EX',
        CACHE_TTL_SECONDS
      )
    } catch (err) {
      // Non-fatal: if Redis write fails, the next request will recompute from DB
      logger.warn('Redis cache write failed', { userId, err, module: 'EntitlementService' })
    }
  }

  // -------------------------------------------------------------------------
  // Private upgrade hint builders
  // -------------------------------------------------------------------------

  /**
   * Finds the lowest plan above the user's current plan that enables the given
   * feature, and builds an UpgradeHint for the denial response.
   */
  private buildFeatureUpgradeHint(
    featureKey: keyof PlanFeatures,
    currentPlanId: PlanId
  ): UpgradeHint | undefined {
    const currentOrder = getPlanOrder(currentPlanId)

    for (const planId of PLAN_ORDER) {
      if (getPlanOrder(planId) <= currentOrder) continue // skip same or lower plans

      const planConfig = PLAN_CONFIG[planId]
      const featureValue = planConfig.features[featureKey]

      // For boolean features, check if enabled in this plan
      if (typeof featureValue === 'boolean' && featureValue) {
        return {
          reason: `'${featureKey}' requires the ${planConfig.name} plan or higher`,
          currentLimit: 'Not included',
          nextPlan: planId,
          nextPlanLimit: 'Included',
          upgradeUrl: `/upgrade?plan=${planId}&feature=${featureKey}`,
        }
      }
    }

    return undefined
  }
}

// ---------------------------------------------------------------------------
// Singleton factory
// ---------------------------------------------------------------------------

let _instance: EntitlementService | null = null

/**
 * Returns the shared EntitlementService singleton.
 * Must be called after Redis and SubscriptionRepository are initialised.
 */
export function getEntitlementService(
  redis: Redis,
  subscriptionRepo: SubscriptionRepository
): EntitlementService {
  if (!_instance) {
    _instance = new EntitlementService(redis, subscriptionRepo)
  }
  return _instance
}

export default EntitlementService
