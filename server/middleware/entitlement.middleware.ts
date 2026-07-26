/**
 * Entitlement Middleware Stack
 *
 * Provides 10 composable Express guards for subscription and feature gating.
 * All functions use a lazy-init singleton EntitlementService backed by the
 * shared Redis connection and a SubscriptionRepository instance.
 *
 * Enterprise bypass: all numeric/feature checks call next() immediately for
 * users on the 'enterprise' plan.
 *
 * Satisfies Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 4.1–4.10
 */

import {
  type Request,
  type Response,
  type NextFunction,
  type RequestHandler,
} from 'express'
import {
  getEntitlementService,
  type AutomationType,
} from '../features/subscription/services/EntitlementService'
import {
  PLAN_CONFIG,
  getPlanOrder,
  type PlanId,
  type PlanFeatures,
} from '../config/plan-config'
import { AddOnModel } from '../features/subscription/db/models/AddOnModel'
import { type AddOnType } from '../config/plan-config'
import SubscriptionRepository from '../features/subscription/db/repositories/SubscriptionRepository'
import { getRedisClient } from '../lib/redis'
import logger from '../config/logger'

// ---------------------------------------------------------------------------
// Lazy singleton — EntitlementService
// ---------------------------------------------------------------------------

let _entitlementService: ReturnType<typeof getEntitlementService> | null = null

function getService(): ReturnType<typeof getEntitlementService> {
  if (!_entitlementService) {
    const redis = getRedisClient()
    const subscriptionRepo = new SubscriptionRepository()
    _entitlementService = getEntitlementService(redis, subscriptionRepo)
  }
  return _entitlementService
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract the userId string from req.user regardless of shape (_id vs id). */
function getUserId(req: Request): string | undefined {
  const user = (req as any).user
  if (!user) return undefined
  return String(user.id ?? user._id ?? '')
}

/**
 * Return the next plan above `currentPlanId` that provides the feature /
 * limit improvement, along with a human-readable upgradeHint string.
 */
function buildUpgradeHint(currentPlanId: PlanId, reason: string): string {
  const order = getPlanOrder(currentPlanId)
  const planIds: PlanId[] = ['free', 'creator', 'pro', 'business', 'enterprise']
  const nextPlan = planIds.find((p) => getPlanOrder(p) > order) ?? 'creator'
  const nextConfig = PLAN_CONFIG[nextPlan]
  return `${reason}. Upgrade to ${nextConfig.name} to unlock this capability. Visit /settings/billing to upgrade.`
}

// ---------------------------------------------------------------------------
// 1. requireSubscription
// ---------------------------------------------------------------------------

/**
 * Rejects users whose subscription status is 'cancelled', 'expired', or
 * 'payment_failed' (past the grace period). Enterprise users always pass.
 *
 * HTTP 402 on denial: { error, currentPlan, upgradeUrl, reason }
 */
export function requireSubscription(): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = getUserId(req)
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    try {
      const service = getService()
      const currentPlan = await service.getPlan(userId)

      // Enterprise bypass — all checks skipped
      if (currentPlan === 'enterprise') {
        logger.info(
          'requireSubscription: enterprise bypass',
          { module: 'subscription', userId, action: 'entitlement_check', limitKey: 'subscription', result: 'allowed', planId: currentPlan }
        )
        return next()
      }

      // Read raw subscription status to detect terminal states
      const subscriptionRepo = new SubscriptionRepository()
      const subscription = await subscriptionRepo.findByUserId(userId)

      if (!subscription) {
        // No subscription — getPlan already returned 'free', allow access
        logger.info(
          'requireSubscription: no subscription doc, allowing free access',
          { module: 'subscription', userId, action: 'entitlement_check', limitKey: 'subscription', result: 'allowed', planId: currentPlan }
        )
        return next()
      }

      const { status, gracePeriodEndsAt } = subscription

      // payment_failed past grace period
      if (
        status === 'payment_failed' &&
        gracePeriodEndsAt != null &&
        gracePeriodEndsAt < new Date()
      ) {
        logger.info(
          'requireSubscription: payment_failed past grace period',
          { module: 'subscription', userId, action: 'entitlement_check', limitKey: 'subscription', result: 'denied', planId: currentPlan }
        )
        res.status(402).json({
          error: 'Subscription required',
          currentPlan,
          upgradeUrl: '/settings/billing',
          reason: 'Your payment failed and the grace period has expired. Please update your payment method.',
        })
        return
      }

      // Definitively terminal statuses
      if (status === 'cancelled' || status === 'expired') {
        logger.info(
          `requireSubscription: subscription ${status}`,
          { module: 'subscription', userId, action: 'entitlement_check', limitKey: 'subscription', result: 'denied', planId: currentPlan }
        )
        res.status(402).json({
          error: 'Subscription required',
          currentPlan,
          upgradeUrl: '/settings/billing',
          reason:
            status === 'cancelled'
              ? 'Your subscription has been cancelled.'
              : 'Your subscription has expired.',
        })
        return
      }

      logger.info(
        'requireSubscription: allowed',
        { module: 'subscription', userId, action: 'entitlement_check', limitKey: 'subscription', result: 'allowed', planId: currentPlan }
      )
      return next()
    } catch (err) {
      logger.error('requireSubscription: unexpected error', err, { module: 'subscription', userId })
      res.status(500).json({ error: 'Internal server error' })
    }
  }
}

// ---------------------------------------------------------------------------
// 2. requireFeature
// ---------------------------------------------------------------------------

/**
 * Verifies the user's plan includes the requested feature flag.
 * Respects admin featureOverrides. Enterprise users always pass.
 *
 * HTTP 403 on denial: { error, featureKey, currentPlan, requiredPlan, upgradeHint }
 */
export function requireFeature(featureKey: keyof PlanFeatures): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = getUserId(req)
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    try {
      const service = getService()
      const currentPlan = await service.getPlan(userId)

      // Enterprise bypass
      if (currentPlan === 'enterprise') {
        logger.info(
          'requireFeature: enterprise bypass',
          { module: 'subscription', userId, action: 'entitlement_check', featureKey, result: 'allowed', planId: currentPlan }
        )
        return next()
      }

      const result = await service.canUseFeature(userId, featureKey)

      logger.info(
        `requireFeature(${featureKey}): ${result.allowed ? 'allowed' : 'denied'}`,
        { module: 'subscription', userId, action: 'entitlement_check', featureKey, result: result.allowed ? 'allowed' : 'denied', planId: result.currentPlan }
      )

      if (!result.allowed) {
        res.status(403).json({
          error: `Feature '${featureKey}' is not available on your current plan`,
          featureKey,
          currentPlan: result.currentPlan,
          requiredPlan: result.requiredPlan,
          upgradeHint: result.upgradeHint,
        })
        return
      }

      return next()
    } catch (err) {
      logger.error('requireFeature: unexpected error', err, { module: 'subscription', userId, featureKey })
      res.status(500).json({ error: 'Internal server error' })
    }
  }
}

// ---------------------------------------------------------------------------
// 3. requireCredits
// ---------------------------------------------------------------------------

/**
 * Verifies the user has at least `amount` AI credits remaining.
 * Enterprise users always pass.
 *
 * HTTP 402 on denial: { error, required, remaining, purchaseUrl }
 */
export function requireCredits(amount: number): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = getUserId(req)
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    try {
      const service = getService()
      const currentPlan = await service.getPlan(userId)

      // Enterprise bypass
      if (currentPlan === 'enterprise') {
        logger.info(
          'requireCredits: enterprise bypass',
          { module: 'subscription', userId, action: 'entitlement_check', limitKey: 'aiCredits', result: 'allowed', planId: currentPlan }
        )
        return next()
      }

      const remaining = await service.remainingCredits(userId)

      logger.info(
        `requireCredits(${amount}): remaining=${remaining}`,
        {
          module: 'subscription',
          userId,
          action: 'entitlement_check',
          limitKey: 'aiCredits',
          result: remaining >= amount ? 'allowed' : 'denied',
          planId: currentPlan,
        }
      )

      if (remaining < amount) {
        res.status(402).json({
          error: 'Insufficient AI credits',
          required: amount,
          remaining,
          purchaseUrl: '/settings/billing?tab=credits',
        })
        return
      }

      return next()
    } catch (err) {
      logger.error('requireCredits: unexpected error', err, { module: 'subscription', userId })
      res.status(500).json({ error: 'Internal server error' })
    }
  }
}

// ---------------------------------------------------------------------------
// 4. requireWorkspaceLimit
// ---------------------------------------------------------------------------

/**
 * Verifies the user has not yet reached their workspace limit.
 * Enterprise users always pass.
 *
 * HTTP 403 on denial: { error, currentCount, maxAllowed, currentPlan, upgradeHint }
 */
export function requireWorkspaceLimit(): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = getUserId(req)
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    try {
      const service = getService()
      const currentPlan = await service.getPlan(userId)

      // Enterprise bypass
      if (currentPlan === 'enterprise') {
        logger.info(
          'requireWorkspaceLimit: enterprise bypass',
          { module: 'subscription', userId, action: 'entitlement_check', limitKey: 'maxWorkspaces', result: 'allowed', planId: currentPlan }
        )
        return next()
      }

      const remaining = await service.remainingWorkspaces(userId)
      const maxAllowed = await service.getLimit(userId, 'maxWorkspaces')
      const currentCount = maxAllowed === Infinity ? 0 : maxAllowed - remaining

      logger.info(
        `requireWorkspaceLimit: remaining=${remaining}`,
        {
          module: 'subscription',
          userId,
          action: 'entitlement_check',
          limitKey: 'maxWorkspaces',
          result: remaining > 0 ? 'allowed' : 'denied',
          planId: currentPlan,
        }
      )

      if (remaining <= 0) {
        res.status(403).json({
          error: 'Workspace limit reached',
          currentCount,
          maxAllowed: maxAllowed === Infinity ? -1 : maxAllowed,
          currentPlan,
          upgradeHint: buildUpgradeHint(currentPlan, `Your ${currentPlan} plan allows ${maxAllowed} workspace(s)`),
        })
        return
      }

      return next()
    } catch (err) {
      logger.error('requireWorkspaceLimit: unexpected error', err, { module: 'subscription', userId })
      res.status(500).json({ error: 'Internal server error' })
    }
  }
}

// ---------------------------------------------------------------------------
// 5. requireProfileLimit
// ---------------------------------------------------------------------------

/**
 * Verifies the user has not yet reached their social profile limit.
 * Enterprise users always pass.
 *
 * HTTP 403 on denial: { error, currentPlan, upgradeHint }
 */
export function requireProfileLimit(): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = getUserId(req)
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    try {
      const service = getService()
      const currentPlan = await service.getPlan(userId)

      // Enterprise bypass
      if (currentPlan === 'enterprise') {
        logger.info(
          'requireProfileLimit: enterprise bypass',
          { module: 'subscription', userId, action: 'entitlement_check', limitKey: 'maxProfiles', result: 'allowed', planId: currentPlan }
        )
        return next()
      }

      const remaining = await service.remainingProfiles(userId)
      const maxAllowed = await service.getLimit(userId, 'maxProfiles')

      logger.info(
        `requireProfileLimit: remaining=${remaining}`,
        {
          module: 'subscription',
          userId,
          action: 'entitlement_check',
          limitKey: 'maxProfiles',
          result: remaining > 0 ? 'allowed' : 'denied',
          planId: currentPlan,
        }
      )

      if (remaining <= 0) {
        res.status(403).json({
          error: 'Social profile limit reached',
          currentPlan,
          upgradeHint: buildUpgradeHint(
            currentPlan,
            `Your ${currentPlan} plan allows up to ${maxAllowed === Infinity ? 'unlimited' : maxAllowed} social profile(s)`
          ),
        })
        return
      }

      return next()
    } catch (err) {
      logger.error('requireProfileLimit: unexpected error', err, { module: 'subscription', userId })
      res.status(500).json({ error: 'Internal server error' })
    }
  }
}

// ---------------------------------------------------------------------------
// 5b. requirePostQuota
// ---------------------------------------------------------------------------

/**
 * Verifies the user has not exhausted their monthly scheduled-post quota
 * (scheduledPostsPerMonth). Free = 30/month; Creator/Pro/Business = unlimited.
 * Enterprise users always pass.
 *
 * HTTP 403 on denial: { error, currentPlan, maxAllowed, upgradeHint }
 */
export function requirePostQuota(): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = getUserId(req)
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    try {
      const service = getService()
      const currentPlan = await service.getPlan(userId)

      // Enterprise bypass
      if (currentPlan === 'enterprise') {
        logger.info('requirePostQuota: enterprise bypass', {
          module: 'subscription', userId, action: 'entitlement_check', limitKey: 'scheduledPostsPerMonth', result: 'allowed', planId: currentPlan,
        })
        return next()
      }

      const maxAllowed = await service.getLimit(userId, 'scheduledPostsPerMonth')

      // Unlimited plans (limit resolves to Infinity) always pass.
      if (maxAllowed === Infinity) {
        return next()
      }

      // Determine how many posts this request wants to schedule, grouped by the
      // target calendar month. Bulk requests send `items: [{ scheduledAt }]`;
      // single-schedule requests send a top-level `scheduledAt`.
      const monthKey = (d: Date) => `${d.getUTCFullYear()}-${d.getUTCMonth()}`
      const requestedByMonth = new Map<string, { count: number; reference: Date }>()

      const bulkItems = Array.isArray((req.body as any)?.items) ? (req.body as any).items : null
      if (bulkItems) {
        for (const item of bulkItems) {
          const raw = item?.scheduledAt
          const when = raw ? new Date(raw) : new Date()
          const ref = isNaN(when.getTime()) ? new Date() : when
          const key = monthKey(ref)
          const entry = requestedByMonth.get(key)
          if (entry) entry.count += 1
          else requestedByMonth.set(key, { count: 1, reference: ref })
        }
      } else {
        const raw = (req.body as any)?.scheduledAt
        const when = raw ? new Date(raw) : new Date()
        const ref = isNaN(when.getTime()) ? new Date() : when
        requestedByMonth.set(monthKey(ref), { count: 1, reference: ref })
      }

      // Each target month must independently have enough remaining quota.
      for (const { count: requested, reference } of requestedByMonth.values()) {
        const remaining = await service.remainingPosts(userId, reference)

        logger.info(`requirePostQuota: remaining=${remaining} requested=${requested}`, {
          module: 'subscription', userId, action: 'entitlement_check', limitKey: 'scheduledPostsPerMonth', result: remaining >= requested ? 'allowed' : 'denied', planId: currentPlan,
        })

        if (remaining < requested) {
          res.status(403).json({
            error: 'Monthly scheduled-post limit reached',
            currentPlan,
            maxAllowed,
            remaining,
            requested,
            upgradeHint: buildUpgradeHint(
              currentPlan,
              `Your ${currentPlan} plan allows ${maxAllowed} scheduled posts per month (${remaining} remaining, ${requested} requested)`
            ),
          })
          return
        }
      }

      return next()
    } catch (err) {
      logger.error('requirePostQuota: unexpected error', err, { module: 'subscription', userId })
      res.status(500).json({ error: 'Internal server error' })
    }
  }
}

// ---------------------------------------------------------------------------
// 5c. requireDraftPosts
// ---------------------------------------------------------------------------

/**
 * Gates saving posts as DRAFTS to the Creator plan and above (draftPosts
 * feature). Only enforced when the request explicitly saves a draft
 * (req.body.status === 'draft'); create-then-publish / create-then-schedule
 * flows pass through untouched so Free users can still publish and schedule.
 * Enterprise users always pass.
 *
 * HTTP 403 on denial: { error, featureKey, currentPlan, requiredPlan, upgradeHint }
 */
export function requireDraftPosts(): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Only guard explicit draft saves; publishing/scheduling is unaffected.
    if ((req.body as any)?.status !== 'draft') {
      return next()
    }

    const userId = getUserId(req)
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    try {
      const service = getService()
      const currentPlan = await service.getPlan(userId)

      if (currentPlan === 'enterprise') return next()

      const result = await service.canUseFeature(userId, 'draftPosts')

      logger.info(`requireDraftPosts: ${result.allowed ? 'allowed' : 'denied'}`, {
        module: 'subscription', userId, action: 'entitlement_check', featureKey: 'draftPosts', result: result.allowed ? 'allowed' : 'denied', planId: result.currentPlan,
      })

      if (!result.allowed) {
        res.status(403).json({
          error: 'Saving drafts is available on the Creator plan and above',
          featureKey: 'draftPosts',
          currentPlan: result.currentPlan,
          requiredPlan: result.requiredPlan,
          upgradeHint: result.upgradeHint,
        })
        return
      }

      return next()
    } catch (err) {
      logger.error('requireDraftPosts: unexpected error', err, { module: 'subscription', userId })
      res.status(500).json({ error: 'Internal server error' })
    }
  }
}

// ---------------------------------------------------------------------------
// 6. requireAnalyticsLimit
// ---------------------------------------------------------------------------

/**
 * Verifies the user's plan supports the requested analytics history window.
 * Enterprise users always pass.
 *
 * HTTP 403 on denial: { error, requestedDays, allowedDays, currentPlan, upgradeHint }
 */
export function requireAnalyticsLimit(requestedDays: number): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = getUserId(req)
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    try {
      const service = getService()
      const currentPlan = await service.getPlan(userId)

      // Enterprise bypass
      if (currentPlan === 'enterprise') {
        logger.info(
          'requireAnalyticsLimit: enterprise bypass',
          { module: 'subscription', userId, action: 'entitlement_check', limitKey: 'analyticsHistoryDays', result: 'allowed', planId: currentPlan }
        )
        return next()
      }

      const allowedDays = await service.getLimit(userId, 'analyticsHistoryDays')

      // Find the next plan's limit for the upgradeHint
      const planIds: PlanId[] = ['free', 'creator', 'pro', 'business', 'enterprise']
      const currentOrder = getPlanOrder(currentPlan)
      const nextPlan = planIds.find((p) => getPlanOrder(p) > currentOrder)
      const nextPlanLimit = nextPlan
        ? PLAN_CONFIG[nextPlan].limits.analyticsHistoryDays
        : -1

      logger.info(
        `requireAnalyticsLimit(${requestedDays}): allowedDays=${allowedDays}`,
        {
          module: 'subscription',
          userId,
          action: 'entitlement_check',
          limitKey: 'analyticsHistoryDays',
          result: allowedDays >= requestedDays ? 'allowed' : 'denied',
          planId: currentPlan,
        }
      )

      if (allowedDays < requestedDays) {
        const nextPlanName = nextPlan ? PLAN_CONFIG[nextPlan].name : 'a higher plan'
        res.status(403).json({
          error: 'Analytics history limit exceeded',
          requestedDays,
          allowedDays: allowedDays === Infinity ? -1 : allowedDays,
          currentPlan,
          upgradeHint: `Your ${currentPlan} plan provides ${allowedDays === Infinity ? 'unlimited' : allowedDays} days of analytics history. Upgrade to ${nextPlanName} for ${nextPlanLimit === -1 ? 'unlimited' : nextPlanLimit} days. Visit /settings/billing to upgrade.`,
        })
        return
      }

      return next()
    } catch (err) {
      logger.error('requireAnalyticsLimit: unexpected error', err, { module: 'subscription', userId })
      res.status(500).json({ error: 'Internal server error' })
    }
  }
}

// ---------------------------------------------------------------------------
// 7. requireAutomationLimit
// ---------------------------------------------------------------------------

/**
 * Verifies the user has remaining quota for the specified automation type.
 * Enterprise users always pass.
 *
 * HTTP 403 on denial: { error, type, currentPlan, upgradeHint }
 */
export function requireAutomationLimit(type: AutomationType): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = getUserId(req)
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    try {
      const service = getService()
      const currentPlan = await service.getPlan(userId)

      // Enterprise bypass
      if (currentPlan === 'enterprise') {
        logger.info(
          'requireAutomationLimit: enterprise bypass',
          { module: 'subscription', userId, action: 'entitlement_check', limitKey: type, result: 'allowed', planId: currentPlan }
        )
        return next()
      }

      const remaining = await service.remainingAutomation(userId, type)

      logger.info(
        `requireAutomationLimit(${type}): remaining=${remaining}`,
        {
          module: 'subscription',
          userId,
          action: 'entitlement_check',
          limitKey: type,
          result: remaining > 0 ? 'allowed' : 'denied',
          planId: currentPlan,
        }
      )

      if (remaining <= 0) {
        res.status(403).json({
          error: `Automation limit reached for '${type}'`,
          type,
          currentPlan,
          upgradeHint: buildUpgradeHint(
            currentPlan,
            `You have reached the ${type} limit on your ${currentPlan} plan`
          ),
        })
        return
      }

      return next()
    } catch (err) {
      logger.error('requireAutomationLimit: unexpected error', err, { module: 'subscription', userId, type })
      res.status(500).json({ error: 'Internal server error' })
    }
  }
}

// ---------------------------------------------------------------------------
// 8. requireRole
// ---------------------------------------------------------------------------

/**
 * Verifies the user meets the minimum role level for the operation.
 * Role hierarchy: owner > admin > member
 * If req.user has no role information, the check passes through — role
 * enforcement is handled at the workspace level.
 *
 * HTTP 403 on denial: { error, requiredRole, currentRole }
 */
export function requireRole(roleLevel: 'owner' | 'admin' | 'member'): RequestHandler {
  const ROLE_ORDER: Record<string, number> = {
    member: 0,
    admin: 1,
    owner: 2,
  }

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = getUserId(req)
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    try {
      const user = (req as any).user
      const userRole: string | undefined = user?.role

      // No role info — pass through; role enforcement is done at workspace level
      if (!userRole) {
        logger.info(
          'requireRole: no role on user, passing through',
          { module: 'subscription', userId, action: 'entitlement_check', limitKey: 'role', result: 'allowed' }
        )
        return next()
      }

      const userRoleOrder = ROLE_ORDER[userRole] ?? -1
      const requiredRoleOrder = ROLE_ORDER[roleLevel] ?? 0

      logger.info(
        `requireRole(${roleLevel}): userRole=${userRole}`,
        {
          module: 'subscription',
          userId,
          action: 'entitlement_check',
          limitKey: 'role',
          result: userRoleOrder >= requiredRoleOrder ? 'allowed' : 'denied',
        }
      )

      if (userRoleOrder < requiredRoleOrder) {
        res.status(403).json({
          error: 'Insufficient role permissions',
          requiredRole: roleLevel,
          currentRole: userRole,
        })
        return
      }

      return next()
    } catch (err) {
      logger.error('requireRole: unexpected error', err, { module: 'subscription', userId })
      res.status(500).json({ error: 'Internal server error' })
    }
  }
}

// ---------------------------------------------------------------------------
// 9. requireAddon
// ---------------------------------------------------------------------------

/**
 * Verifies the user has an active add-on of the given type.
 * Enterprise users always pass.
 *
 * HTTP 403 on denial: { error, addonType, purchaseUrl }
 */
export function requireAddon(addonType: AddOnType): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = getUserId(req)
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    try {
      const service = getService()
      const currentPlan = await service.getPlan(userId)

      // Enterprise bypass
      if (currentPlan === 'enterprise') {
        logger.info(
          'requireAddon: enterprise bypass',
          { module: 'subscription', userId, action: 'entitlement_check', limitKey: addonType, result: 'allowed', planId: currentPlan }
        )
        return next()
      }

      const activeAddon = await AddOnModel.findOne({
        userId,
        type: addonType,
        status: 'active',
      }).lean()

      logger.info(
        `requireAddon(${addonType}): ${activeAddon ? 'found' : 'not found'}`,
        {
          module: 'subscription',
          userId,
          action: 'entitlement_check',
          limitKey: addonType,
          result: activeAddon ? 'allowed' : 'denied',
          planId: currentPlan,
        }
      )

      if (!activeAddon) {
        res.status(403).json({
          error: 'Add-on required',
          addonType,
          purchaseUrl: `/settings/billing?tab=addons&addon=${addonType}`,
        })
        return
      }

      return next()
    } catch (err) {
      logger.error('requireAddon: unexpected error', err, { module: 'subscription', userId, addonType })
      res.status(500).json({ error: 'Internal server error' })
    }
  }
}

// ---------------------------------------------------------------------------
// 10. requirePlan
// ---------------------------------------------------------------------------

/**
 * Verifies the user's current plan meets the specified minimum tier.
 * Enterprise users always pass (enterprise is the highest tier).
 *
 * HTTP 403 on denial: { error, currentPlan, minimumPlan, upgradeHint }
 */
export function requirePlan(minimumPlan: PlanId): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = getUserId(req)
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    try {
      const service = getService()
      const currentPlan = await service.getPlan(userId)

      // Enterprise bypass (highest plan, always passes)
      if (currentPlan === 'enterprise') {
        logger.info(
          'requirePlan: enterprise bypass',
          { module: 'subscription', userId, action: 'entitlement_check', limitKey: 'plan', result: 'allowed', planId: currentPlan }
        )
        return next()
      }

      const currentOrder = getPlanOrder(currentPlan)
      const minimumOrder = getPlanOrder(minimumPlan)

      logger.info(
        `requirePlan(${minimumPlan}): currentPlan=${currentPlan}`,
        {
          module: 'subscription',
          userId,
          action: 'entitlement_check',
          limitKey: 'plan',
          result: currentOrder >= minimumOrder ? 'allowed' : 'denied',
          planId: currentPlan,
        }
      )

      if (currentOrder < minimumOrder) {
        const minimumConfig = PLAN_CONFIG[minimumPlan]
        res.status(403).json({
          error: `This feature requires the ${minimumConfig.name} plan or higher`,
          currentPlan,
          minimumPlan,
          upgradeHint: `Upgrade to ${minimumConfig.name} or higher to access this feature. Visit /settings/billing to upgrade.`,
        })
        return
      }

      return next()
    } catch (err) {
      logger.error('requirePlan: unexpected error', err, { module: 'subscription', userId, minimumPlan })
      res.status(500).json({ error: 'Internal server error' })
    }
  }
}
