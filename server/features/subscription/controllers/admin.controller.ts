/**
 * Admin Subscription Controller
 *
 * All endpoints require admin authentication — auth middleware is applied at
 * the router level in admin.routes.ts.
 *
 * Every state-changing operation writes a SubscriptionEvent audit document
 * with `triggeredBy: 'admin'` and the `adminUserId` extracted from the
 * authenticated request.
 *
 * Satisfies Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.8, 15.8
 */

import type { Request, Response } from 'express'
import { z } from 'zod'
import SubscriptionModel from '../db/models/SubscriptionModel'
import { SubscriptionEventModel } from '../db/models/SubscriptionEventModel'
import { AddOnModel } from '../db/models/AddOnModel'
import AICreditsModel from '../db/models/AICreditsModel'
import PaymentModel from '../db/models/PaymentModel'
import { AICreditsRepository } from '../db/repositories/AICreditsRepository'
import { getSubscriptionRepository } from '../db/repositories/SubscriptionRepository'
import { razorpaySubscriptionService } from '../services/RazorpaySubscriptionService'
import { isValidPlan, PLAN_CONFIG } from '../../../config/plan-config'
import type { PlanId } from '../../../config/plan-config'
import { getRedisClient } from '../../../lib/redis'
import logger from '../../../config/logger'

// ---------------------------------------------------------------------------
// Lazy-initialised singletons
// ---------------------------------------------------------------------------

let _aiCreditsRepo: AICreditsRepository | null = null

function getAICreditsRepo(): AICreditsRepository {
  if (!_aiCreditsRepo) _aiCreditsRepo = new AICreditsRepository()
  return _aiCreditsRepo
}

// ---------------------------------------------------------------------------
// Helper — invalidate Redis entitlement cache for a user
// ---------------------------------------------------------------------------

async function invalidateEntitlementCache(userId: string): Promise<void> {
  try {
    const redis = getRedisClient()
    await redis.del(`sub:entitlement:${userId}`)
    logger.debug('Entitlement cache invalidated', { userId, module: 'admin.controller' })
  } catch (err) {
    // Non-fatal — next request will recompute from DB
    logger.warn('Failed to invalidate entitlement cache', { userId, err, module: 'admin.controller' })
  }
}

// ---------------------------------------------------------------------------
// Helper — write a SubscriptionEvent audit document
// ---------------------------------------------------------------------------

async function recordAdminEvent(
  eventType: string,
  userId: string,
  subscriptionId: string,
  adminUserId: string,
  metadata: Record<string, unknown>,
  previousStatus?: string | null,
  newStatus?: string | null,
  previousPlan?: string | null,
  newPlan?: string | null
): Promise<void> {
  try {
    await SubscriptionEventModel.create({
      eventType,
      userId,
      subscriptionId,
      previousStatus: previousStatus ?? null,
      newStatus: newStatus ?? null,
      previousPlan: previousPlan ?? null,
      newPlan: newPlan ?? null,
      triggeredBy: 'admin',
      adminUserId,
      metadata,
      timestamp: new Date(),
    })
  } catch (err) {
    logger.error(
      'Failed to write admin SubscriptionEvent audit record',
      err,
      { eventType, userId, subscriptionId, adminUserId, module: 'admin.controller' }
    )
  }
}

// ---------------------------------------------------------------------------
// Helper — parse Zod result and return 400 on failure
// ---------------------------------------------------------------------------

function parseBody<T>(
  schema: z.ZodSchema<T>,
  body: unknown,
  res: Response
): T | null {
  const result = schema.safeParse(body)
  if (!result.success) {
    res.status(400).json({
      error: 'Validation failed',
      details: result.error.flatten(),
    })
    return null
  }
  return result.data
}

// ---------------------------------------------------------------------------
// 1. GET :userId/subscription — getUserSubscription
// ---------------------------------------------------------------------------

/**
 * Returns the full subscription state for a user:
 *   - Subscription document
 *   - AI credit balances
 *   - Active add-ons
 */
export async function getUserSubscription(
  req: Request,
  res: Response
): Promise<void> {
  const { userId } = req.params

  try {
    const [subscription, aiCredits, activeAddOns] = await Promise.all([
      SubscriptionModel.findOne({ userId }).lean(),
      AICreditsModel.findOne({ userId }).lean(),
      AddOnModel.find({ userId, status: 'active' }).lean(),
    ])

    res.status(200).json({
      subscription,
      aiCredits,
      activeAddOns,
    })
  } catch (err) {
    logger.error('getUserSubscription failed', err, { userId, module: 'admin.controller' })
    res.status(500).json({ error: 'Internal server error' })
  }
}

// ---------------------------------------------------------------------------
// 2. POST :userId/plan — setUserPlan
// ---------------------------------------------------------------------------

const SetUserPlanSchema = z.object({
  planId: z.string(),
})

/**
 * Manually override a user's subscription plan.
 * Validates the planId, updates the Subscription doc, invalidates cache,
 * allocates new AI credits, and writes a plan.manually_set audit event.
 */
export async function setUserPlan(
  req: Request,
  res: Response
): Promise<void> {
  const { userId } = req.params
  const adminUserId = (req as any).user?.id as string

  const body = parseBody(SetUserPlanSchema, req.body, res)
  if (!body) return

  const { planId } = body

  // Reject unknown plans
  if (!isValidPlan(planId)) {
    res.status(400).json({ error: `Unknown plan identifier: '${planId}'` })
    return
  }

  try {
    const existing = await SubscriptionModel.findOne({ userId }).lean()

    if (!existing) {
      res.status(404).json({ error: `No subscription found for userId: ${userId}` })
      return
    }

    const previousPlan = existing.plan

    // Update subscription plan
    await SubscriptionModel.findOneAndUpdate(
      { userId },
      { $set: { plan: planId as PlanId } },
      { new: true }
    ).lean()

    // Invalidate Redis entitlement cache
    await invalidateEntitlementCache(userId)

    // Allocate new AI credits for the plan
    const planConfig = PLAN_CONFIG[planId as PlanId]
    const monthlyCredits = planConfig.limits.aiCreditsPerMonth
    // nextResetAt: 30 days from now (best approximation without a billing date)
    const nextResetAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

    if (monthlyCredits > 0) {
      await getAICreditsRepo().upsertForUser(userId, monthlyCredits, nextResetAt)
    }

    // Write audit event
    await recordAdminEvent(
      'plan.manually_set',
      userId,
      existing.subscriptionId,
      adminUserId,
      { previousPlan, newPlan: planId },
      existing.status,
      existing.status,
      previousPlan,
      planId
    )

    logger.info(
      'Admin manually set user plan',
      { userId, adminUserId, previousPlan, newPlan: planId, module: 'admin.controller' }
    )

    res.status(200).json({
      success: true,
      previousPlan,
      newPlan: planId,
    })
  } catch (err) {
    logger.error('setUserPlan failed', err, { userId, adminUserId, module: 'admin.controller' })
    res.status(500).json({ error: 'Internal server error' })
  }
}

// ---------------------------------------------------------------------------
// 3. POST :userId/credits — adjustCredits
// ---------------------------------------------------------------------------

const AdjustCreditsSchema = z.object({
  amount: z.number().int().nonnegative(),
  operation: z.enum(['add', 'subtract']),
})

/**
 * Atomically add or subtract AI credits for a user.
 * Rejects negative amount values (enforced by Zod schema).
 * Uses $inc for atomic update.
 */
export async function adjustCredits(
  req: Request,
  res: Response
): Promise<void> {
  const { userId } = req.params
  const adminUserId = (req as any).user?.id as string

  const body = parseBody(AdjustCreditsSchema, req.body, res)
  if (!body) return

  const { amount, operation } = body

  const increment = operation === 'add' ? amount : -amount

  try {
    const updated = await AICreditsModel.findOneAndUpdate(
      { userId },
      { $inc: { remainingCredits: increment, purchasedCredits: increment } },
      { new: true, upsert: false }
    ).lean()

    if (!updated) {
      res.status(404).json({ error: `No AI credits document found for userId: ${userId}` })
      return
    }

    // Get subscription for audit reference
    const subscription = await SubscriptionModel.findOne({ userId }).lean()

    // Write audit event
    if (subscription) {
      await recordAdminEvent(
        'credits.admin_adjusted',
        userId,
        subscription.subscriptionId,
        adminUserId,
        { amount, operation, newBalance: updated.remainingCredits }
      )
    }

    logger.info(
      'Admin adjusted AI credits',
      { userId, adminUserId, amount, operation, newBalance: updated.remainingCredits, module: 'admin.controller' }
    )

    res.status(200).json({
      success: true,
      newBalance: updated.remainingCredits,
    })
  } catch (err) {
    logger.error('adjustCredits failed', err, { userId, adminUserId, module: 'admin.controller' })
    res.status(500).json({ error: 'Internal server error' })
  }
}

// ---------------------------------------------------------------------------
// 4. POST :userId/addon — grantRevokeAddon
// ---------------------------------------------------------------------------

const GrantRevokeAddonSchema = z.object({
  addonType: z.string(),
  action: z.enum(['grant', 'revoke']),
})

/**
 * Grant or revoke an add-on for a user.
 * Grant: creates an AddOn doc with status 'active' and no razorpaySubscriptionId.
 * Revoke: sets status 'cancelled' on the most recent active add-on of that type.
 */
export async function grantRevokeAddon(
  req: Request,
  res: Response
): Promise<void> {
  const { userId } = req.params
  const adminUserId = (req as any).user?.id as string

  const body = parseBody(GrantRevokeAddonSchema, req.body, res)
  if (!body) return

  const { addonType, action } = body

  try {
    const subscription = await SubscriptionModel.findOne({ userId }).lean()

    if (action === 'grant') {
      // Create a new AddOn document with no razorpaySubscriptionId (admin grant)
      await AddOnModel.create({
        userId,
        type: addonType,
        quantity: 1,
        status: 'active',
        razorpaySubscriptionId: null,
        currentPeriodEnd: null,
      })
    } else {
      // Revoke: set status 'cancelled' on existing active add-on
      const revoked = await AddOnModel.findOneAndUpdate(
        { userId, type: addonType, status: 'active' },
        { $set: { status: 'cancelled' } },
        { new: true }
      ).lean()

      if (!revoked) {
        res.status(404).json({
          error: `No active add-on of type '${addonType}' found for userId: ${userId}`,
        })
        return
      }
    }

    // Invalidate Redis entitlement cache
    await invalidateEntitlementCache(userId)

    // Write audit event
    if (subscription) {
      await recordAdminEvent(
        `addon.admin_${action}ed`,
        userId,
        subscription.subscriptionId,
        adminUserId,
        { addonType, action }
      )
    }

    logger.info(
      `Admin ${action}ed add-on`,
      { userId, adminUserId, addonType, action, module: 'admin.controller' }
    )

    res.status(200).json({ success: true, addonType, action })
  } catch (err) {
    logger.error('grantRevokeAddon failed', err, { userId, adminUserId, module: 'admin.controller' })
    res.status(500).json({ error: 'Internal server error' })
  }
}

// ---------------------------------------------------------------------------
// 5. POST :userId/cancel — forceCancelSubscription
// ---------------------------------------------------------------------------

/**
 * Immediately set the subscription status to 'cancelled'.
 * Invalidates cache and writes an audit event.
 */
export async function forceCancelSubscription(
  req: Request,
  res: Response
): Promise<void> {
  const { userId } = req.params
  const adminUserId = (req as any).user?.id as string

  try {
    const existing = await SubscriptionModel.findOne({ userId }).lean()

    if (!existing) {
      res.status(404).json({ error: `No subscription found for userId: ${userId}` })
      return
    }

    await SubscriptionModel.findOneAndUpdate(
      { userId },
      { $set: { status: 'cancelled' } },
      { new: true }
    ).lean()

    // Invalidate Redis entitlement cache
    await invalidateEntitlementCache(userId)

    // Write audit event
    await recordAdminEvent(
      'subscription.admin_cancelled',
      userId,
      existing.subscriptionId,
      adminUserId,
      { reason: 'admin_force_cancel' },
      existing.status,
      'cancelled',
      existing.plan,
      existing.plan
    )

    logger.info(
      'Admin force-cancelled subscription',
      { userId, adminUserId, module: 'admin.controller' }
    )

    res.status(200).json({ success: true })
  } catch (err) {
    logger.error('forceCancelSubscription failed', err, { userId, adminUserId, module: 'admin.controller' })
    res.status(500).json({ error: 'Internal server error' })
  }
}

// ---------------------------------------------------------------------------
// 6. POST :userId/extend — extendBillingPeriod
// ---------------------------------------------------------------------------

const ExtendBillingPeriodSchema = z.object({
  days: z.number().int().positive(),
})

/**
 * Extend the user's current billing period by a given number of days.
 * Both `currentPeriodEnd` and `nextBillingDate` are pushed forward.
 */
export async function extendBillingPeriod(
  req: Request,
  res: Response
): Promise<void> {
  const { userId } = req.params
  const adminUserId = (req as any).user?.id as string

  const body = parseBody(ExtendBillingPeriodSchema, req.body, res)
  if (!body) return

  const { days } = body
  const extensionMs = days * 24 * 60 * 60 * 1000

  try {
    const existing = await SubscriptionModel.findOne({ userId }).lean()

    if (!existing) {
      res.status(404).json({ error: `No subscription found for userId: ${userId}` })
      return
    }

    const currentPeriodEnd = existing.currentPeriodEnd
      ? new Date(existing.currentPeriodEnd.getTime() + extensionMs)
      : new Date(Date.now() + extensionMs)

    const nextBillingDate = existing.nextBillingDate
      ? new Date(existing.nextBillingDate.getTime() + extensionMs)
      : new Date(Date.now() + extensionMs)

    await SubscriptionModel.findOneAndUpdate(
      { userId },
      { $set: { currentPeriodEnd, nextBillingDate } },
      { new: true }
    ).lean()

    // Write audit event
    await recordAdminEvent(
      'billing.period_extended',
      userId,
      existing.subscriptionId,
      adminUserId,
      {
        days,
        originalPeriodEnd: existing.currentPeriodEnd,
        newPeriodEnd: currentPeriodEnd,
        originalNextBillingDate: existing.nextBillingDate,
        newNextBillingDate: nextBillingDate,
      }
    )

    logger.info(
      'Admin extended billing period',
      { userId, adminUserId, days, module: 'admin.controller' }
    )

    res.status(200).json({ success: true, currentPeriodEnd, nextBillingDate })
  } catch (err) {
    logger.error('extendBillingPeriod failed', err, { userId, adminUserId, module: 'admin.controller' })
    res.status(500).json({ error: 'Internal server error' })
  }
}

// ---------------------------------------------------------------------------
// 7. POST :userId/coupon — applyCoupon
// ---------------------------------------------------------------------------

const ApplyCouponSchema = z.object({
  couponCode: z.string(),
  discountPercent: z.number().min(0).max(100),
})

/**
 * Record a coupon application in the audit log.
 * Returns success after writing the SubscriptionEvent with coupon metadata.
 */
export async function applyCoupon(
  req: Request,
  res: Response
): Promise<void> {
  const { userId } = req.params
  const adminUserId = (req as any).user?.id as string

  const body = parseBody(ApplyCouponSchema, req.body, res)
  if (!body) return

  const { couponCode, discountPercent } = body

  try {
    const subscription = await SubscriptionModel.findOne({ userId }).lean()

    if (!subscription) {
      res.status(404).json({ error: `No subscription found for userId: ${userId}` })
      return
    }

    // Write audit event with coupon metadata
    await recordAdminEvent(
      'coupon.applied',
      userId,
      subscription.subscriptionId,
      adminUserId,
      { couponCode, discountPercent }
    )

    logger.info(
      'Admin applied coupon',
      { userId, adminUserId, couponCode, discountPercent, module: 'admin.controller' }
    )

    res.status(200).json({ success: true })
  } catch (err) {
    logger.error('applyCoupon failed', err, { userId, adminUserId, module: 'admin.controller' })
    res.status(500).json({ error: 'Internal server error' })
  }
}

// ---------------------------------------------------------------------------
// 8. GET :userId/history — getSubscriptionHistory
// ---------------------------------------------------------------------------

/**
 * Return the last 100 subscription events for a user, sorted newest-first.
 */
export async function getSubscriptionHistory(
  req: Request,
  res: Response
): Promise<void> {
  const { userId } = req.params

  try {
    const events = await SubscriptionEventModel
      .find({ userId })
      .sort({ timestamp: -1 })
      .limit(100)
      .lean()

    res.status(200).json({ events })
  } catch (err) {
    logger.error('getSubscriptionHistory failed', err, { userId, module: 'admin.controller' })
    res.status(500).json({ error: 'Internal server error' })
  }
}

// ---------------------------------------------------------------------------
// 9. POST :userId/refund — processRefund
// ---------------------------------------------------------------------------

const ProcessRefundSchema = z.object({
  paymentId: z.string(),
  amount: z.number().positive(),
  reason: z.string(),
})

/**
 * Process a refund via Razorpay for a completed payment.
 * Writes a refund audit event on success.
 */
export async function processRefund(
  req: Request,
  res: Response
): Promise<void> {
  const { userId } = req.params
  const adminUserId = (req as any).user?.id as string

  const body = parseBody(ProcessRefundSchema, req.body, res)
  if (!body) return

  const { paymentId, amount, reason } = body

  try {
    const subscription = await SubscriptionModel.findOne({ userId }).lean()
    if (!subscription) {
      res.status(404).json({ error: `No subscription found for userId: ${userId}` })
      return
    }

    // Razorpay refunds are keyed by payment_id only (not subscription_id), so
    // we look up the Payment record by our internal paymentId to resolve the
    // associated razorpayPaymentId before calling createRefund.
    const payment = await PaymentModel.findOne({ paymentId, userId }).lean()
    if (!payment?.razorpayPaymentId) {
      res.status(404).json({ error: `No Razorpay payment found for paymentId: ${paymentId}` })
      return
    }

    const refund = await razorpaySubscriptionService.createRefund(
      payment.razorpayPaymentId,
      amount,
      { reason, adminUserId, userId }
    )

    // Write audit event
    await recordAdminEvent(
      'refund.processed',
      userId,
      subscription.subscriptionId,
      adminUserId,
      { paymentId, amount, reason, refundId: refund.refundId, refundStatus: refund.status }
    )

    logger.info(
      'Admin processed refund',
      { userId, adminUserId, paymentId, amount, refundId: refund.refundId, module: 'admin.controller' }
    )

    res.status(200).json({
      success: true,
      refundId: refund.refundId,
    })
  } catch (err) {
    logger.error('processRefund failed', err, { userId, adminUserId, module: 'admin.controller' })
    res.status(500).json({ error: 'Internal server error' })
  }
}

// ---------------------------------------------------------------------------
// 10. POST :userId/override — setFeatureOverride
// ---------------------------------------------------------------------------

const SetFeatureOverrideSchema = z.object({
  featureKey: z.string(),
  enabled: z.boolean(),
})

/**
 * Set or update a feature override on a user's subscription document.
 * Uses MongoDB $set to update the featureOverrides map atomically.
 * Invalidates cache so the override takes effect on the next request.
 */
export async function setFeatureOverride(
  req: Request,
  res: Response
): Promise<void> {
  const { userId } = req.params
  const adminUserId = (req as any).user?.id as string

  const body = parseBody(SetFeatureOverrideSchema, req.body, res)
  if (!body) return

  const { featureKey, enabled } = body

  try {
    const existing = await SubscriptionModel.findOne({ userId }).lean()

    if (!existing) {
      res.status(404).json({ error: `No subscription found for userId: ${userId}` })
      return
    }

    // Update featureOverrides map using dot-notation $set for atomic update
    await SubscriptionModel.findOneAndUpdate(
      { userId },
      { $set: { [`featureOverrides.${featureKey}`]: enabled } },
      { new: true }
    ).lean()

    // Invalidate Redis entitlement cache so override takes effect immediately
    await invalidateEntitlementCache(userId)

    // Write audit event
    await recordAdminEvent(
      'feature.override_set',
      userId,
      existing.subscriptionId,
      adminUserId,
      { featureKey, enabled }
    )

    logger.info(
      'Admin set feature override',
      { userId, adminUserId, featureKey, enabled, module: 'admin.controller' }
    )

    res.status(200).json({ success: true, featureKey, enabled })
  } catch (err) {
    logger.error('setFeatureOverride failed', err, { userId, adminUserId, module: 'admin.controller' })
    res.status(500).json({ error: 'Internal server error' })
  }
}
