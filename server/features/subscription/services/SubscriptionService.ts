/**
 * SubscriptionService
 *
 * Orchestrates the full subscription lifecycle: creation, upgrade, downgrade,
 * cancellation, and resumption. All Razorpay API calls, MongoDB writes, cache
 * invalidation, and audit event recording are coordinated here.
 *
 * Constructor dependencies are injected to keep the class testable:
 *  - subscriptionRepo  : SubscriptionRepository  — MongoDB access layer
 *  - entitlementService: EntitlementService       — cache invalidation
 *  - redis             : Redis                    — passed through to notifiers
 *
 * Razorpay interactions are performed via the module-level singleton
 * `razorpaySubscriptionService`. Quota notifications are delegated to `quotaNotifier`.
 *
 * IMPORTANT — unlike the previous Cashfree integration, Razorpay's
 * authentication transaction (the charge made when the customer completes
 * checkout) charges the FULL plan amount immediately, not a token amount.
 * There is no separate "raise the real charge afterwards" step. The
 * subscription only reaches paid-access status once that authentication
 * payment is confirmed captured via webhook (see webhook.controller.ts) —
 * never on subscription creation alone.
 */

import { type Redis } from 'ioredis'
import { razorpaySubscriptionService } from './RazorpaySubscriptionService'
import { quotaNotifier } from './QuotaNotifier'
import { AICreditsRepository } from '../db/repositories/AICreditsRepository'
import { SubscriptionEventModel } from '../db/models/SubscriptionEventModel'
import RazorpayPlanModel from '../db/models/RazorpayPlanModel'
import {
  PLAN_CONFIG,
  isValidPlan,
  getPlanOrder,
  type PlanId,
  type BillingCycle,
} from '../../../config/plan-config'
import logger from '../../../config/logger'
import type SubscriptionRepository from '../db/repositories/SubscriptionRepository'
import type EntitlementService from './EntitlementService'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Returns a Date that is exactly `days` calendar days from now. */
function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
}

/**
 * Number of billing cycles to pass as Razorpay's `total_count`. Razorpay
 * requires a finite count (no "until cancelled" option), so we use a large
 * value approximating 10 years and rely on our own cancel/resume flow to
 * manage the actual subscription lifecycle rather than letting it expire
 * naturally.
 */
const TOTAL_BILLING_CYCLES: Record<BillingCycle, number> = {
  monthly: 120, // 10 years of monthly cycles
  yearly: 10,   // 10 years of yearly cycles
}

// ---------------------------------------------------------------------------
// SubscriptionService
// ---------------------------------------------------------------------------

// Must match SUB_ME_CACHE_PREFIX in subscription.controller.ts — the Redis key
// prefix for the cached GET /api/v2/subscription/me response.
const SUB_ME_CACHE_PREFIX = 'sub:me:'

export class SubscriptionService {
  private readonly aiCreditsRepo: AICreditsRepository

  constructor(
    private readonly subscriptionRepo: SubscriptionRepository,
    private readonly entitlementService: EntitlementService,
    private readonly redis: Redis,
  ) {
    this.aiCreditsRepo = new AICreditsRepository()
  }

  /**
   * Invalidates BOTH subscription-related Redis caches for a user:
   *  - sub:entitlement:{userId} (via entitlementService.invalidateCache)
   *  - sub:me:{userId}          (the cached GET /api/v2/subscription/me response)
   *
   * BUG FIX: every mutation method below (upgrade, downgrade, cancel, resume)
   * previously called ONLY entitlementService.invalidateCache(), which clears
   * the entitlement cache used for feature/limit checks but NOT the separate
   * `sub:me:{userId}` cache that getSubscriptionMe() actually reads and
   * returns to the client (30s TTL). That meant the Billing page could keep
   * showing/using a stale plan for up to 30 seconds after upgrading,
   * downgrading, cancelling, or resuming — which is what produced the
   * "current: 'business', requested: 'business'" error: the client's cached
   * view of the current plan didn't match what had just been written to
   * MongoDB, so the upgrade-order check was comparing against stale data.
   * Only downgradeToFree (in the controller) previously cleared this cache.
   */
  private async invalidateAllCaches(userId: string): Promise<void> {
    await this.entitlementService.invalidateCache(userId)
    try {
      await this.redis.del(`${SUB_ME_CACHE_PREFIX}${userId}`)
    } catch (err) {
      logger.warn('Failed to invalidate sub:me cache (non-fatal)', {
        userId,
        err: (err as Error)?.message,
        module: 'SubscriptionService',
      })
    }
  }

  // -------------------------------------------------------------------------
  // Internal — resolve or create the Razorpay plan_id for a given plan/cycle
  // -------------------------------------------------------------------------

  /**
   * Returns the cached Razorpay plan_id for (planType, billingCycle),
   * creating it at Razorpay on first use. Razorpay plans are immutable price
   * points, so this cache prevents creating a duplicate plan on every
   * checkout for the same price.
   */
  private async getOrCreateRazorpayPlanId(planType: PlanId, billingCycle: BillingCycle): Promise<string> {
    const planConfig = PLAN_CONFIG[planType]
    const amountPaise = planConfig.pricing[billingCycle]

    const existing = await RazorpayPlanModel.findOne({ planType, billingCycle, amountPaise }).lean()
    if (existing) {
      return existing.razorpayPlanId
    }

    const razorpayPlanId = await razorpaySubscriptionService.createPlan({
      planType,
      billingCycle,
      amountRupees: amountPaise / 100,
    })

    await RazorpayPlanModel.create({ planType, billingCycle, amountPaise, razorpayPlanId })

    logger.info(
      'Created new Razorpay plan',
      { planType, billingCycle, amountPaise, razorpayPlanId, module: 'SubscriptionService' },
    )

    return razorpayPlanId
  }

  // -------------------------------------------------------------------------
  // 1. create
  // -------------------------------------------------------------------------

  /**
   * Initiate a new subscription for a user.
   *
   * Steps:
   *  1. Validate planId.
   *  2. Create (or re-use) the Razorpay customer.
   *  3. Resolve/create the Razorpay plan for this plan+cycle price point.
   *  4. Create a Razorpay subscription — customer must complete the
   *     authentication transaction (full plan amount) to activate it.
   *  5. Upsert the local Subscription document with status 'pending_payment'.
   *  6. Record a SubscriptionEvent for the audit trail.
   *  7. Return `{ subscriptionId, checkoutUrl }` so the caller can launch
   *     Razorpay Checkout (JS SDK using subscriptionId, or redirect via
   *     checkoutUrl / short_url).
   *
   * The subscription is NOT marked 'active' here. That transition happens
   * when Razorpay fires the `subscription.charged` / `payment.captured`
   * webhook after the authentication payment is confirmed successful.
   *
   * @param userId        - Veefore user ID.
   * @param workspaceId   - The workspace this subscription is billed against.
   * @param planId        - Must be a valid PlanId (validated via isValidPlan).
   * @param billingCycle  - 'monthly' or 'yearly'.
   * @param email         - Customer email forwarded to Razorpay.
   * @param phone         - Customer phone forwarded to Razorpay.
   * @returns `{ subscriptionId, checkoutUrl }`
   */
  async create(
    userId: string,
    workspaceId: string,
    planId: string,
    billingCycle: BillingCycle,
    email: string,
    phone: string,
  ): Promise<{ subscriptionId: string; checkoutUrl: string }> {
    // Step 1 — validate planId
    if (!isValidPlan(planId)) {
      logger.warn(
        'create() called with invalid planId',
        { userId, planId, module: 'SubscriptionService' },
      )
      throw new Error(`Invalid planId: '${planId}'`)
    }

    const validPlanId = planId as PlanId

    logger.info(
      'Starting subscription creation',
      { userId, workspaceId, planId: validPlanId, billingCycle, module: 'SubscriptionService' },
    )

    // Step 2 — create Razorpay customer
    const customer = await razorpaySubscriptionService.createCustomer(userId, email, phone)

    // Step 3 — resolve/create the Razorpay plan for this price point
    const razorpayPlanId = await this.getOrCreateRazorpayPlanId(validPlanId, billingCycle)

    // Step 4 — create Razorpay subscription
    const razorpaySub = await razorpaySubscriptionService.createSubscription({
      customerId: customer.customerId,
      planId: razorpayPlanId,
      totalCount: TOTAL_BILLING_CYCLES[billingCycle],
      notes: {
        veefore_user_id: userId,
        veefore_workspace_id: workspaceId,
        veefore_plan_id: validPlanId,
        veefore_billing_cycle: billingCycle,
      },
    })

    logger.info(
      'Razorpay createSubscription response',
      {
        userId,
        razorpaySubId: razorpaySub.subscriptionId,
        status: razorpaySub.status,
        module: 'SubscriptionService',
      },
    )

    // Step 5 — upsert local Subscription document
    // NOTE: status is 'pending_payment' — paid plan limits are NOT granted
    // until the webhook confirms the authentication payment was captured.
    const now = new Date()
    const placeholderPeriodEnd = billingCycle === 'yearly' ? daysFromNow(365) : daysFromNow(30)

    const subscription = await this.subscriptionRepo.upsert({
      userId,
      workspaceId,
      plan: validPlanId,
      billingCycle,
      status: 'pending_payment',
      razorpaySubscriptionId: razorpaySub.subscriptionId,
      razorpayCustomerId: customer.customerId,
      razorpayPlanId,
      currentPeriodStart: now,
      // Placeholder period end until the webhook activates the subscription
      currentPeriodEnd: placeholderPeriodEnd,
      nextBillingDate: placeholderPeriodEnd,
      cancelAtPeriodEnd: false,
    } as Parameters<typeof this.subscriptionRepo.upsert>[0])

    // Step 6 — record audit event
    await SubscriptionEventModel.create({
      eventType: 'subscription.created',
      userId,
      subscriptionId: subscription.subscriptionId ?? (subscription as any)._id?.toString() ?? 'unknown',
      previousStatus: null,
      newStatus: 'pending_payment',
      previousPlan: null,
      newPlan: validPlanId,
      triggeredBy: 'user',
      metadata: {
        workspaceId,
        billingCycle,
        razorpaySubscriptionId: razorpaySub.subscriptionId,
        razorpayCustomerId: customer.customerId,
        razorpayPlanId,
      },
      timestamp: new Date(),
    })

    logger.info(
      'Subscription created, awaiting Razorpay checkout completion',
      {
        userId,
        planId: validPlanId,
        razorpaySubscriptionId: razorpaySub.subscriptionId,
        module: 'SubscriptionService',
      },
    )

    // Invalidate caches — the new subscription is 'pending_payment'
    // (not yet paid), so any cached paid limits must be flushed to enforce
    // free-tier access.
    await this.invalidateAllCaches(userId)

    // Step 7 — return subscriptionId (for JS Checkout) and a hosted checkout
    // URL fallback (short_url behaves like a payment link).
    return {
      subscriptionId: razorpaySub.subscriptionId,
      checkoutUrl: razorpaySub.shortUrl ?? '',
    }
  }

  // -------------------------------------------------------------------------
  // 2. upgrade
  // -------------------------------------------------------------------------

  /**
   * Upgrade a user's subscription to a higher-tier plan.
   *
   * Steps:
   *  1. Validate newPlanId and verify it is a higher tier than the current plan.
   *  2. If a Razorpay subscription exists, cancel the old one (immediately)
   *     then create a new one for the upgraded plan. The customer must
   *     complete a new authentication transaction for the new plan amount.
   *  3. Update the local Subscription document with the new plan.
   *  4. Invalidate the entitlement cache.
   *  5. Record a SubscriptionEvent.
   *  6. Allocate new AI credits for the next billing cycle.
   *
   * @param userId    - Veefore user ID.
   * @param newPlanId - Must be a valid PlanId that is a higher tier than current.
   */
  async upgrade(userId: string, newPlanId: string): Promise<void> {
    // Step 1 — validate newPlanId
    if (!isValidPlan(newPlanId)) {
      throw new Error(`Invalid planId: '${newPlanId}'`)
    }

    const newPlan = newPlanId as PlanId

    const subscription = await this.subscriptionRepo.findByUserId(userId)
    if (!subscription) {
      throw new Error(`No subscription found for userId: ${userId}`)
    }

    // BUG FIX: this method previously only checked plan tier ORDER, never
    // subscription STATUS. That let a user with a cancelled/expired/
    // never-paid subscription "upgrade" repeatedly — each call created a
    // brand-new, unpaid Razorpay subscription and immediately wrote the new
    // plan name into the local record with no payment confirmation gate
    // (unlike create(), which correctly stays in 'pending_payment' until the
    // subscription.activated webhook fires). That produced ghost
    // subscriptions with paid_count:0 while the account showed a paid plan
    // it was never actually charged for, and eventually left the account in
    // an inconsistent plan/status combination.
    if (subscription.status !== 'active') {
      throw new Error(
        `upgrade() requires an active paid subscription. Current status: '${subscription.status}'. ` +
        `Start a new subscription via create() instead.`,
      )
    }

    const currentPlan = subscription.plan as PlanId

    if (getPlanOrder(newPlan) <= getPlanOrder(currentPlan)) {
      throw new Error(
        `upgrade() requires a higher-tier plan. Current: '${currentPlan}', requested: '${newPlan}'`,
      )
    }

    logger.info(
      'Upgrading subscription',
      { userId, currentPlan, newPlan, module: 'SubscriptionService' },
    )

    // Step 2 — swap Razorpay subscription if one exists
    let newRazorpaySubId = subscription.razorpaySubscriptionId ?? null
    const billingCycle = subscription.billingCycle as BillingCycle

    if (subscription.razorpaySubscriptionId) {
      // Cancel old Razorpay subscription immediately (no grace period for
      // the OLD plan — the new plan's authentication charge takes over).
      await razorpaySubscriptionService.cancelSubscription(subscription.razorpaySubscriptionId, false)

      // Resolve/create the Razorpay plan for the upgraded price point
      const razorpayPlanId = await this.getOrCreateRazorpayPlanId(newPlan, billingCycle)

      // Create new Razorpay subscription for the upgraded plan
      const newRazorpaySub = await razorpaySubscriptionService.createSubscription({
        customerId: subscription.razorpayCustomerId ?? userId,
        planId: razorpayPlanId,
        totalCount: TOTAL_BILLING_CYCLES[billingCycle],
        notes: {
          veefore_user_id: userId,
          veefore_plan_id: newPlan,
          veefore_billing_cycle: billingCycle,
          veefore_upgrade_from: currentPlan,
        },
      })
      newRazorpaySubId = newRazorpaySub.subscriptionId
    }

    // Step 3 — update the local Subscription document
    const updatedSubscription = await this.subscriptionRepo.upsert({
      userId,
      plan: newPlan,
      ...(newRazorpaySubId !== subscription.razorpaySubscriptionId
        ? { razorpaySubscriptionId: newRazorpaySubId }
        : {}),
    } as Parameters<typeof this.subscriptionRepo.upsert>[0])

    // Step 4 — invalidate caches
    await this.invalidateAllCaches(userId)

    // Step 5 — record audit event
    await SubscriptionEventModel.create({
      eventType: 'subscription.upgraded',
      userId,
      subscriptionId: updatedSubscription.subscriptionId,
      previousStatus: subscription.status,
      newStatus: subscription.status,
      previousPlan: currentPlan,
      newPlan,
      triggeredBy: 'user',
      metadata: {
        previousRazorpaySubscriptionId: subscription.razorpaySubscriptionId,
        newRazorpaySubscriptionId: newRazorpaySubId,
        billingCycle: subscription.billingCycle,
      },
      timestamp: new Date(),
    })

    // Step 6 — allocate new AI credits for the upgraded plan
    const newPlanConfig = PLAN_CONFIG[newPlan]
    const nextBillingDate = subscription.nextBillingDate ?? daysFromNow(30)

    await this.aiCreditsRepo.upsertForUser(
      userId,
      newPlanConfig.limits.aiCreditsPerMonth,
      nextBillingDate,
    )

    logger.info(
      'Subscription upgraded successfully',
      {
        userId,
        previousPlan: currentPlan,
        newPlan,
        aiCreditsAllocated: newPlanConfig.limits.aiCreditsPerMonth,
        module: 'SubscriptionService',
      },
    )
  }

  // -------------------------------------------------------------------------
  // 3. downgrade
  // -------------------------------------------------------------------------

  /**
   * Schedule a downgrade to a lower-tier plan at the end of the current period.
   *
   * The actual downgrade (plan swap, credit reallocation, Razorpay
   * subscription change) is applied by the cron job or webhook at period
   * end. This method only sets the intent flags on the Subscription document.
   *
   * Steps:
   *  1. Validate newPlanId and verify it is a lower tier than the current plan.
   *  2. Set `cancelAtPeriodEnd = true` and store `pendingDowngradePlan` in
   *     the subscription's metadata field.
   *  3. Record a SubscriptionEvent.
   *
   * @param userId    - Veefore user ID.
   * @param newPlanId - Must be a valid PlanId that is a lower tier than current.
   */
  async downgrade(userId: string, newPlanId: string): Promise<void> {
    // Step 1 — validate newPlanId
    if (!isValidPlan(newPlanId)) {
      throw new Error(`Invalid planId: '${newPlanId}'`)
    }

    const newPlan = newPlanId as PlanId

    const subscription = await this.subscriptionRepo.findByUserId(userId)
    if (!subscription) {
      throw new Error(`No subscription found for userId: ${userId}`)
    }

    const currentPlan = subscription.plan as PlanId

    if (getPlanOrder(newPlan) >= getPlanOrder(currentPlan)) {
      throw new Error(
        `downgrade() requires a lower-tier plan. Current: '${currentPlan}', requested: '${newPlan}'`,
      )
    }

    logger.info(
      'Scheduling subscription downgrade at period end',
      { userId, currentPlan, newPlan, module: 'SubscriptionService' },
    )

    // Step 2 — mark cancelAtPeriodEnd on the subscription document.
    // The pending downgrade plan is recorded in the SubscriptionEvent below
    // (eventType: 'subscription.downgrade_scheduled', newPlan field).
    // The cron job / webhook handler that fires at period end reads the latest
    // 'downgrade_scheduled' event to determine the target plan to apply.
    await this.subscriptionRepo.upsert({
      userId,
      cancelAtPeriodEnd: true,
    } as Parameters<typeof this.subscriptionRepo.upsert>[0])

    // Step 3 — record audit event
    await SubscriptionEventModel.create({
      eventType: 'subscription.downgrade_scheduled',
      userId,
      subscriptionId: subscription.subscriptionId,
      previousStatus: subscription.status,
      newStatus: subscription.status,
      previousPlan: currentPlan,
      newPlan,
      triggeredBy: 'user',
      metadata: {
        currentPlan,
        pendingDowngradePlan: newPlan,
        willApplyAt: subscription.currentPeriodEnd,
      },
      timestamp: new Date(),
    })

    // Step 4 — invalidate caches so the "cancelAtPeriodEnd" flag change is
    // reflected immediately on the Billing page instead of up to 30s later.
    await this.invalidateAllCaches(userId)

    logger.info(
      'Downgrade scheduled — will apply at period end',
      {
        userId,
        currentPlan,
        scheduledDowngradePlan: newPlan,
        willApplyAt: subscription.currentPeriodEnd,
        module: 'SubscriptionService',
      },
    )
  }

  // -------------------------------------------------------------------------
  // 4. cancel
  // -------------------------------------------------------------------------

  /**
   * Cancel the user's subscription at the end of the current billing period.
   *
   * Steps:
   *  1. Set `cancelAtPeriodEnd = true` on the local Subscription document.
   *  2. If a Razorpay subscription exists, cancel it at cycle end (Razorpay
   *     supports `cancel_at_cycle_end` natively, so the mandate itself
   *     keeps the subscription active/charging until the current period
   *     completes, exactly matching the product requirement).
   *  3. Send a cancellation confirmation email via QuotaNotifier.
   *  4. Record a SubscriptionEvent.
   *  5. Invalidate the entitlement cache.
   *
   * Premium access continues until `currentPeriodEnd`.
   *
   * @param userId - Veefore user ID.
   */
  async cancel(userId: string): Promise<void> {
    const subscription = await this.subscriptionRepo.findByUserId(userId)
    if (!subscription) {
      throw new Error(`No subscription found for userId: ${userId}`)
    }

    logger.info(
      'Cancelling subscription',
      {
        userId,
        plan: subscription.plan,
        currentPeriodEnd: subscription.currentPeriodEnd,
        module: 'SubscriptionService',
      },
    )

    // Step 1 — set cancelAtPeriodEnd on the local document
    await this.subscriptionRepo.upsert({
      userId,
      cancelAtPeriodEnd: true,
    } as Parameters<typeof this.subscriptionRepo.upsert>[0])

    // Step 2 — cancel on Razorpay if a remote subscription exists.
    // cancelAtCycleEnd=true: Razorpay keeps the subscription active (and
    // won't charge again) until the current billing cycle completes.
    if (subscription.razorpaySubscriptionId) {
      try {
        await razorpaySubscriptionService.cancelSubscription(subscription.razorpaySubscriptionId, true)
      } catch (err) {
        // Log but do not rethrow — the local state is the authoritative record.
        // The nightly reconciliation cron will detect and sync any divergence.
        logger.error(
          'Razorpay cancelSubscription failed; local state still updated',
          err,
          {
            userId,
            razorpaySubscriptionId: subscription.razorpaySubscriptionId,
            module: 'SubscriptionService',
          },
        )
      }
    }

    // Step 3 — send cancellation confirmation email
    await quotaNotifier.sendCancellationConfirmation(
      userId,
      subscription.currentPeriodEnd,
      this.redis,
    )

    // Step 4 — record audit event
    await SubscriptionEventModel.create({
      eventType: 'subscription.cancelled',
      userId,
      subscriptionId: subscription.subscriptionId,
      previousStatus: subscription.status,
      newStatus: subscription.status, // status stays the same until period end
      previousPlan: subscription.plan,
      newPlan: subscription.plan,
      triggeredBy: 'user',
      metadata: {
        cancelAtPeriodEnd: true,
        accessEndsAt: subscription.currentPeriodEnd,
        razorpaySubscriptionId: subscription.razorpaySubscriptionId ?? null,
      },
      timestamp: new Date(),
    })

    // Step 5 — invalidate caches
    await this.invalidateAllCaches(userId)

    logger.info(
      'Subscription cancelled — premium access continues until period end',
      {
        userId,
        accessEndsAt: subscription.currentPeriodEnd,
        module: 'SubscriptionService',
      },
    )
  }

  // -------------------------------------------------------------------------
  // 5. resume
  // -------------------------------------------------------------------------

  /**
   * Resume a previously cancelled subscription before the period end.
   *
   * Steps:
   *  1. Set `cancelAtPeriodEnd = false` on the local Subscription document.
   *  2. Cancel the scheduled cancellation on Razorpay via
   *     `cancelScheduledChanges` if the subscription hasn't actually ended
   *     yet; otherwise create a fresh subscription (customer must
   *     re-authenticate).
   *  3. Record a SubscriptionEvent.
   *  4. Invalidate the entitlement cache.
   *
   * @param userId - Veefore user ID.
   */
  async resume(userId: string): Promise<void> {
    const subscription = await this.subscriptionRepo.findByUserId(userId)
    if (!subscription) {
      throw new Error(`No subscription found for userId: ${userId}`)
    }

    logger.info(
      'Resuming subscription',
      { userId, plan: subscription.plan, module: 'SubscriptionService' },
    )

    // Step 1 — clear cancelAtPeriodEnd flag
    await this.subscriptionRepo.upsert({
      userId,
      cancelAtPeriodEnd: false,
    } as Parameters<typeof this.subscriptionRepo.upsert>[0])

    // Step 2 — attempt to reactivate on Razorpay.
    // If the subscription is still within its current cycle (cancellation
    // was scheduled for cycle end but hasn't happened yet), the mandate is
    // still active — no Razorpay-side action is needed since we already
    // only set cancelAtPeriodEnd locally.
    //
    // If the subscription has already ended on Razorpay's side, the
    // customer must complete a fresh authentication transaction.
    if (subscription.razorpaySubscriptionId && subscription.razorpayCustomerId) {
      try {
        const remoteSub = await razorpaySubscriptionService.getSubscription(subscription.razorpaySubscriptionId)
        const remoteStatus = String(remoteSub.status ?? '')

        if (remoteStatus === 'cancelled' || remoteStatus === 'completed' || remoteStatus === 'expired') {
          // Subscription has actually ended — create a new one, customer must re-authenticate.
          const billingCycle = subscription.billingCycle as BillingCycle
          const razorpayPlanId = await this.getOrCreateRazorpayPlanId(subscription.plan as PlanId, billingCycle)

          const reactivated = await razorpaySubscriptionService.createSubscription({
            customerId: subscription.razorpayCustomerId,
            planId: razorpayPlanId,
            totalCount: TOTAL_BILLING_CYCLES[billingCycle],
            notes: { veefore_user_id: userId, veefore_plan_id: subscription.plan },
          })

          await this.subscriptionRepo.upsert({
            userId,
            razorpaySubscriptionId: reactivated.subscriptionId,
            status: 'pending_payment',
          } as Parameters<typeof this.subscriptionRepo.upsert>[0])

          logger.info(
            'Previous Razorpay subscription had ended — created new subscription, customer must re-authenticate',
            { userId, newRazorpaySubscriptionId: reactivated.subscriptionId, module: 'SubscriptionService' },
          )
        }
        // Otherwise the mandate is still live on Razorpay — nothing to do there.
      } catch (err) {
        // Log but do not rethrow — local state update stands.
        logger.error(
          'Razorpay re-activation check failed; local cancelAtPeriodEnd still cleared',
          err,
          {
            userId,
            razorpaySubscriptionId: subscription.razorpaySubscriptionId,
            module: 'SubscriptionService',
          },
        )
      }
    }

    // Step 3 — record audit event
    await SubscriptionEventModel.create({
      eventType: 'subscription.resumed',
      userId,
      subscriptionId: subscription.subscriptionId,
      previousStatus: subscription.status,
      newStatus: subscription.status,
      previousPlan: subscription.plan,
      newPlan: subscription.plan,
      triggeredBy: 'user',
      metadata: {
        razorpaySubscriptionId: subscription.razorpaySubscriptionId ?? null,
      },
      timestamp: new Date(),
    })

    // Step 4 — invalidate caches
    await this.invalidateAllCaches(userId)

    logger.info(
      'Subscription resumed successfully',
      { userId, plan: subscription.plan, module: 'SubscriptionService' },
    )
  }
}

// ---------------------------------------------------------------------------
// Singleton factory
// ---------------------------------------------------------------------------

let _instance: SubscriptionService | null = null

/**
 * Returns the shared SubscriptionService singleton.
 * Must be called after SubscriptionRepository, EntitlementService, and Redis
 * are fully initialised.
 */
export function getSubscriptionService(
  subscriptionRepo: SubscriptionRepository,
  entitlementService: EntitlementService,
  redis: Redis,
): SubscriptionService {
  if (!_instance) {
    _instance = new SubscriptionService(subscriptionRepo, entitlementService, redis)
  }
  return _instance
}

export default SubscriptionService
