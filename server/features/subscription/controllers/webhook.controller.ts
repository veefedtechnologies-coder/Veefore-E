/**
 * Razorpay Webhook Controller
 *
 * Handles inbound Razorpay subscription/payment/refund lifecycle events.
 *
 * Security:
 *  - Route MUST be mounted with `express.raw({ type: 'application/json' })` so
 *    `req.body` arrives as a Buffer (raw bytes required for HMAC verification).
 *  - Signature is verified with HMAC-SHA256 via WebhookVerifier before any
 *    payload is parsed. Razorpay signs the raw body alone (no timestamp
 *    concatenation, unlike the previous Cashfree integration).
 *
 * Idempotency:
 *  - Razorpay does not guarantee a single top-level event ID field across all
 *    API versions, so we prefer the `x-razorpay-event-id` header when present
 *    and fall back to a derived key of `${event}:${entityId}`. Keys are
 *    stored in Redis with a 24-hour TTL via WebhookVerifier. Duplicate
 *    deliveries (Razorpay retries on non-200 responses) are silently
 *    acknowledged with HTTP 200 without re-processing.
 *
 * Billing model:
 *  - Razorpay charges the FULL plan amount on the subscription's
 *    authentication transaction — there is no separate "raise a real charge
 *    afterwards" step like the previous Cashfree mandate-then-charge flow.
 *    Paid access is granted the moment `subscription.activated` (first
 *    successful charge) or `subscription.charged` (renewal charge) fires.
 *
 * Satisfies Requirements: 10.1 – 10.8
 */

import type { Request, Response } from 'express'
import { webhookVerifier } from '../services/WebhookVerifier'
import { quotaNotifier } from '../services/QuotaNotifier'
import { getRedisClient } from '../../../lib/redis'
import SubscriptionRepository from '../db/repositories/SubscriptionRepository'
import { AICreditsRepository } from '../db/repositories/AICreditsRepository'
import { SubscriptionEventModel } from '../db/models/SubscriptionEventModel'
import SubscriptionModel, { type ISubscription } from '../db/models/SubscriptionModel'
import PaymentModel from '../db/models/PaymentModel'
import { User } from '../../../models/User/User'
import { PLAN_CONFIG, isValidPlan } from '../../../config/plan-config'
import type { PlanId } from '../../../config/plan-config'
import logger from '../../../config/logger'

// ---------------------------------------------------------------------------
// Razorpay webhook payload shape (minimal — only the fields we consume)
// ---------------------------------------------------------------------------

interface RazorpayWebhookEvent {
  entity: string
  account_id?: string
  event: string
  contains?: string[]
  payload: Record<string, unknown>
  created_at?: number
}

// ---------------------------------------------------------------------------
// Lazy-initialised singletons
// ---------------------------------------------------------------------------

let _subscriptionRepo: SubscriptionRepository | null = null
let _aiCreditsRepo: AICreditsRepository | null = null

function getSubscriptionRepo(): SubscriptionRepository {
  if (!_subscriptionRepo) _subscriptionRepo = new SubscriptionRepository()
  return _subscriptionRepo
}

function getAICreditsRepo(): AICreditsRepository {
  if (!_aiCreditsRepo) _aiCreditsRepo = new AICreditsRepository()
  return _aiCreditsRepo
}

// ---------------------------------------------------------------------------
// Grace period — reuses the same 3-day window used by the existing
// grace_period_check cron job (subscriptionCronWorker.ts) and the previous
// Cashfree payment_failed handling, so renewal-retry behaviour is unchanged
// by the gateway migration.
// ---------------------------------------------------------------------------

const PAST_DUE_GRACE_PERIOD_DAYS = 3

// ---------------------------------------------------------------------------
// Helper — resolve plan credits from PLAN_CONFIG (gateway-agnostic)
// ---------------------------------------------------------------------------

function planCreditsPerMonth(planId: string): number {
  if (!isValidPlan(planId)) return 0
  return PLAN_CONFIG[planId as PlanId].limits.aiCreditsPerMonth
}

// ---------------------------------------------------------------------------
// Helper — convert Razorpay Unix-seconds timestamps to Date
// ---------------------------------------------------------------------------

function unixToDate(seconds: number | undefined | null): Date | null {
  if (seconds == null) return null
  return new Date(seconds * 1000)
}

// ---------------------------------------------------------------------------
// Helper — write a raw SubscriptionEvent document
// ---------------------------------------------------------------------------

async function recordEvent(
  eventType: string,
  userId: string,
  subscriptionId: string,
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
      triggeredBy: 'webhook',
      metadata,
      timestamp: new Date(),
    })
  } catch (err) {
    logger.error('Failed to write SubscriptionEvent audit record', err, {
      eventType,
      userId,
      subscriptionId,
      module: 'webhook.controller',
    })
  }
}

// ---------------------------------------------------------------------------
// Cache invalidation helper
// ---------------------------------------------------------------------------

/**
 * Invalidates the Redis entitlement cache for a user.
 * Mirrors EntitlementService.invalidateCache() but avoids instantiating the
 * full EntitlementService (which requires a Redis instance at construction
 * time). The cache key format is `sub:entitlement:{userId}`.
 */
async function invalidateEntitlementCache(userId: string): Promise<void> {
  try {
    const redis = getRedisClient()
    await redis.del(`sub:entitlement:${userId}`)
    logger.debug('Entitlement cache invalidated', { userId, module: 'webhook.controller' })
  } catch (err) {
    // Non-fatal: next request will recompute from DB
    logger.warn('Failed to invalidate entitlement cache', { userId, err, module: 'webhook.controller' })
  }
}

// ---------------------------------------------------------------------------
// Phone capture — persist the contact number Razorpay collected during
// checkout, so future subscribe/resubscribe attempts can prefill it and
// skip Razorpay's mandatory "Contact details" step. Veefore itself has no
// phone field on signup, so the FIRST time we learn a real number is when
// Razorpay's own checkout mandate registration collects it — this is the
// only reliable source, and it only needs to happen once per user.
// ---------------------------------------------------------------------------

async function persistPhoneFromPayment(
  userId: string,
  paymentEntity: Record<string, unknown>,
): Promise<void> {
  try {
    const rawContact = paymentEntity.contact
    if (typeof rawContact !== 'string' && typeof rawContact !== 'number') return

    // Razorpay's payment.entity.contact is E.164-ish, e.g. "+919876543210".
    // Normalise to the bare 10-digit Indian mobile number format our own
    // prefill/create-customer code already expects (see razorpayCheckout.ts
    // and RazorpaySubscriptionService.createCustomer).
    const digitsOnly = String(rawContact).replace(/\D/g, '')
    const tenDigit = digitsOnly.length > 10 ? digitsOnly.slice(-10) : digitsOnly
    if (!/^\d{10}$/.test(tenDigit)) return

    const user = await User.findById(userId).select('preferences').lean<{ preferences?: Record<string, unknown> }>()
    if (!user) return

    // Don't overwrite a phone number the user has already saved/confirmed
    // elsewhere (e.g. Settings) — only fill it in when it's genuinely empty.
    if (user.preferences?.phone) return

    await User.updateOne(
      { _id: userId },
      { $set: { 'preferences.phone': tenDigit } },
    )

    logger.info('Captured phone number from Razorpay payment for future prefill', {
      userId,
      module: 'webhook.controller',
    })
  } catch (err) {
    // Non-fatal — worst case the user is asked for their number again next time.
    logger.warn('Failed to persist phone number from Razorpay payment', {
      userId,
      err,
      module: 'webhook.controller',
    })
  }
}

// ---------------------------------------------------------------------------
// Event-specific handlers
// ---------------------------------------------------------------------------

/**
 * subscription.activated
 *
 * Fires when a Razorpay subscription reaches 'active' status for the first
 * time — i.e. the customer's authentication transaction (the FULL plan
 * amount, not a token charge) has been captured. This is the only trigger
 * for granting paid access on a brand-new subscription; the local document
 * up to this point sits in 'pending_payment' (see SubscriptionService.create).
 */
async function handleSubscriptionActivated(payload: Record<string, unknown>): Promise<void> {
  const subEntity = ((payload.subscription as Record<string, unknown> | undefined)?.entity ??
    {}) as Record<string, unknown>
  const razorpaySubscriptionId = String(subEntity.id ?? '')

  if (!razorpaySubscriptionId) {
    logger.warn('subscription.activated: missing subscription id', { payload, module: 'webhook.controller' })
    return
  }

  const existing = await SubscriptionModel.findOne({ razorpaySubscriptionId }).lean<ISubscription>()
  if (!existing) {
    logger.warn('subscription.activated: no local subscription found for razorpaySubscriptionId', {
      razorpaySubscriptionId,
      module: 'webhook.controller',
    })
    return
  }

  const userId = existing.userId
  const currentPeriodStart = unixToDate(subEntity.current_start as number | undefined) ?? new Date()
  const currentPeriodEnd = unixToDate(subEntity.current_end as number | undefined) ?? existing.currentPeriodEnd
  const paymentEntity = ((payload.payment as Record<string, unknown> | undefined)?.entity ??
    {}) as Record<string, unknown>

  const updated = await SubscriptionModel.findOneAndUpdate(
    { userId },
    {
      $set: {
        status: 'active',
        currentPeriodStart,
        currentPeriodEnd,
        nextBillingDate: currentPeriodEnd,
        cancelAtPeriodEnd: false,
        renewalRetryCount: 0,
        lastRenewalRetryAt: null,
        pastDueGraceEndsAt: null,
      },
    },
    { new: true, upsert: false }
  ).lean<ISubscription>()

  if (!updated) {
    logger.warn('subscription.activated: subscription update failed', { userId, module: 'webhook.controller' })
    return
  }

  // Save the contact number Razorpay just collected for the mandate, so the
  // next subscribe/resubscribe skips the "Contact details" prompt.
  await persistPhoneFromPayment(userId, paymentEntity)

  // Allocate AI credits for the first billing cycle
  const monthlyCredits = planCreditsPerMonth(updated.plan)
  if (monthlyCredits > 0) {
    await getAICreditsRepo().upsertForUser(userId, monthlyCredits, currentPeriodEnd)
  }

  // Invalidate entitlement cache so paid limits take effect immediately
  await invalidateEntitlementCache(userId)

  await recordEvent(
    'subscription.activated',
    userId,
    updated.subscriptionId,
    { razorpaySubscriptionId, currentPeriodStart, currentPeriodEnd, raw: payload },
    existing.status,
    'active',
    existing.plan,
    updated.plan
  )

  logger.info('Subscription activated — first charge captured, paid access granted', {
    userId,
    plan: updated.plan,
    module: 'webhook.controller',
  })
}

/**
 * subscription.charged
 *
 * Fires on every successful renewal charge for an already-active
 * subscription. Refreshes the billing period, resets the monthly AI credit
 * quota, and clears any past_due retry state.
 */
async function handleSubscriptionCharged(payload: Record<string, unknown>): Promise<void> {
  const subEntity = ((payload.subscription as Record<string, unknown> | undefined)?.entity ??
    {}) as Record<string, unknown>
  const paymentEntity = ((payload.payment as Record<string, unknown> | undefined)?.entity ??
    {}) as Record<string, unknown>
  const razorpaySubscriptionId = String(subEntity.id ?? '')

  if (!razorpaySubscriptionId) {
    logger.warn('subscription.charged: missing subscription id', { payload, module: 'webhook.controller' })
    return
  }

  const existing = await SubscriptionModel.findOne({ razorpaySubscriptionId }).lean<ISubscription>()
  if (!existing) {
    logger.warn('subscription.charged: no local subscription found for razorpaySubscriptionId', {
      razorpaySubscriptionId,
      module: 'webhook.controller',
    })
    return
  }

  const userId = existing.userId
  const currentPeriodStart = unixToDate(subEntity.current_start as number | undefined) ?? new Date()
  const currentPeriodEnd = unixToDate(subEntity.current_end as number | undefined) ?? existing.currentPeriodEnd
  const paymentId = String(paymentEntity.id ?? '')

  const updated = await SubscriptionModel.findOneAndUpdate(
    { userId },
    {
      $set: {
        status: 'active',
        currentPeriodStart,
        currentPeriodEnd,
        nextBillingDate: currentPeriodEnd,
        renewalRetryCount: 0,
        lastRenewalRetryAt: null,
        pastDueGraceEndsAt: null,
        ...(paymentId ? { lastPaymentId: paymentId } : {}),
      },
    },
    { new: true, upsert: false }
  ).lean<ISubscription>()

  if (!updated) {
    logger.warn('subscription.charged: subscription update failed', { userId, module: 'webhook.controller' })
    return
  }

  // Save the contact number Razorpay collected for this renewal charge, in
  // case it wasn't already captured on subscription.activated (e.g. resumed
  // subscriptions that re-authenticate).
  await persistPhoneFromPayment(userId, paymentEntity)

  // Reset monthly AI credits quota for the new cycle
  const monthlyCredits = planCreditsPerMonth(updated.plan)
  if (monthlyCredits > 0) {
    await getAICreditsRepo().resetMonthly(userId, monthlyCredits, currentPeriodEnd)
  }

  // Invalidate entitlement cache
  await invalidateEntitlementCache(userId)

  await recordEvent(
    'subscription.charged',
    userId,
    updated.subscriptionId,
    { razorpaySubscriptionId, paymentId, currentPeriodStart, currentPeriodEnd, raw: payload },
    existing.status,
    'active',
    existing.plan,
    updated.plan
  )

  logger.info('Subscription renewed — recurring charge captured', {
    userId,
    plan: updated.plan,
    module: 'webhook.controller',
  })
}

/**
 * payment.failed
 *
 * Two distinct cases, distinguished by the EXISTING stored status before
 * this event is processed:
 *  1. First-charge failure — local status is currently 'pending_payment'
 *     (the user has never had paid access). The subscription simply stays
 *     'pending_payment' — no grace period applies since nothing was ever
 *     granted.
 *  2. Renewal failure — local status is currently 'active' or 'past_due'
 *     (the user has real paid access from a prior successful charge).
 *     Increments `renewalRetryCount`, moves the subscription to 'past_due',
 *     and sets `pastDueGraceEndsAt` (if not already set) using the same
 *     3-day grace window as the existing grace_period_check cron job.
 */
async function handlePaymentFailed(payload: Record<string, unknown>): Promise<void> {
  const paymentEntity = ((payload.payment as Record<string, unknown> | undefined)?.entity ??
    {}) as Record<string, unknown>
  const paymentId = String(paymentEntity.id ?? '')
  const notes = (paymentEntity.notes ?? {}) as Record<string, unknown>
  const razorpaySubscriptionIdFromPayment = String(paymentEntity.subscription_id ?? '')

  // Prefer the subscription_id present directly on the payment entity;
  // fall back to the veefore_user_id note attached at subscription creation
  // (see RazorpaySubscriptionService.createSubscription / SubscriptionService).
  let existing: ISubscription | null = null

  if (razorpaySubscriptionIdFromPayment) {
    existing = await SubscriptionModel.findOne({
      razorpaySubscriptionId: razorpaySubscriptionIdFromPayment,
    }).lean<ISubscription>()
  }

  if (!existing) {
    const notesUserId = String(notes.veefore_user_id ?? '')
    if (notesUserId) {
      existing = await getSubscriptionRepo().findByUserId(notesUserId)
    }
  }

  if (!existing) {
    logger.warn('payment.failed: could not resolve local subscription via subscription_id or notes', {
      paymentId,
      razorpaySubscriptionIdFromPayment,
      module: 'webhook.controller',
    })
    return
  }

  const userId = existing.userId
  const redis = getRedisClient()

  if (existing.status === 'pending_payment') {
    // Case 1 — first-charge failure. Never paid, no grace period; the
    // subscription simply stays 'pending_payment' (no access granted).
    await recordEvent(
      'payment.failed',
      userId,
      existing.subscriptionId,
      { paymentId, isFirstChargeFailure: true, raw: payload },
      existing.status,
      'pending_payment',
      existing.plan,
      existing.plan
    )

    await quotaNotifier.sendPaymentFailedNotification(userId, redis)

    logger.info('First charge failed — subscription remains pending_payment, no paid access granted', {
      userId,
      module: 'webhook.controller',
    })
    return
  }

  // Case 2 — renewal failure on an already-paid subscription ('active' or
  // already 'past_due'). Grace period is only set on the FIRST failure of
  // the current retry cycle — subsequent failures reuse the same deadline.
  const pastDueGraceEndsAt =
    existing.pastDueGraceEndsAt ?? new Date(Date.now() + PAST_DUE_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000)

  const updated = await SubscriptionModel.findOneAndUpdate(
    { userId },
    {
      $set: {
        status: 'past_due',
        pastDueGraceEndsAt,
        lastRenewalRetryAt: new Date(),
      },
      $inc: { renewalRetryCount: 1 },
    },
    { new: true, upsert: false }
  ).lean<ISubscription>()

  if (!updated) {
    logger.warn('payment.failed: subscription update failed', { userId, module: 'webhook.controller' })
    return
  }

  // Invalidate entitlement cache (past_due grace-period limits may apply)
  await invalidateEntitlementCache(userId)

  await quotaNotifier.sendPaymentFailedNotification(userId, redis)

  await recordEvent(
    'payment.failed',
    userId,
    updated.subscriptionId,
    { paymentId, pastDueGraceEndsAt, renewalRetryCount: updated.renewalRetryCount, raw: payload },
    existing.status,
    'past_due',
    existing.plan,
    existing.plan
  )

  logger.info('Renewal payment failed — subscription marked past_due, grace period set', {
    userId,
    pastDueGraceEndsAt,
    renewalRetryCount: updated.renewalRetryCount,
    module: 'webhook.controller',
  })
}

/**
 * subscription.cancelled
 *
 * If `ended_at` is already in the past, Razorpay has fully terminated the
 * subscription — downgrade immediately. Otherwise mirror the previous
 * Cashfree semantics: keep access until period end, just flag
 * `cancelAtPeriodEnd`.
 */
async function handleSubscriptionCancelled(payload: Record<string, unknown>): Promise<void> {
  const subEntity = ((payload.subscription as Record<string, unknown> | undefined)?.entity ??
    {}) as Record<string, unknown>
  const razorpaySubscriptionId = String(subEntity.id ?? '')

  if (!razorpaySubscriptionId) {
    logger.warn('subscription.cancelled: missing subscription id', { payload, module: 'webhook.controller' })
    return
  }

  const existing = await SubscriptionModel.findOne({ razorpaySubscriptionId }).lean<ISubscription>()
  if (!existing) {
    logger.warn('subscription.cancelled: no local subscription found for razorpaySubscriptionId', {
      razorpaySubscriptionId,
      module: 'webhook.controller',
    })
    return
  }

  const userId = existing.userId
  const endedAt = unixToDate(subEntity.ended_at as number | undefined)
  const now = new Date()
  const alreadyEnded = endedAt != null && endedAt.getTime() <= now.getTime()
  const redis = getRedisClient()

  if (alreadyEnded) {
    const updated = await SubscriptionModel.findOneAndUpdate(
      { userId },
      { $set: { status: 'cancelled', plan: 'free', cancelAtPeriodEnd: false } },
      { new: true, upsert: false }
    ).lean<ISubscription>()

    if (!updated) {
      logger.warn('subscription.cancelled: subscription update failed', { userId, module: 'webhook.controller' })
      return
    }

    await invalidateEntitlementCache(userId)

    await recordEvent(
      'subscription.cancelled',
      userId,
      updated.subscriptionId,
      { razorpaySubscriptionId, endedAt, raw: payload },
      existing.status,
      'cancelled',
      existing.plan,
      'free'
    )

    await quotaNotifier.sendCancellationConfirmation(userId, now, redis)

    logger.info('Subscription cancelled — already ended at Razorpay, downgraded to free immediately', {
      userId,
      module: 'webhook.controller',
    })
    return
  }

  const updated = await SubscriptionModel.findOneAndUpdate(
    { userId },
    { $set: { cancelAtPeriodEnd: true } },
    { new: true, upsert: false }
  ).lean<ISubscription>()

  if (!updated) {
    logger.warn('subscription.cancelled: subscription update failed', { userId, module: 'webhook.controller' })
    return
  }

  await recordEvent(
    'subscription.cancelled',
    userId,
    updated.subscriptionId,
    { razorpaySubscriptionId, raw: payload },
    existing.status,
    existing.status, // status unchanged — still active until period end
    existing.plan,
    existing.plan
  )

  await quotaNotifier.sendCancellationConfirmation(userId, updated.currentPeriodEnd ?? now, redis)

  logger.info('Subscription cancellation scheduled at period end', { userId, module: 'webhook.controller' })
}

/**
 * subscription.paused
 *
 * No Cashfree equivalent existed. Reuses the existing 'past_due' status
 * (no new enum value is introduced) since a paused subscription grants no
 * new charges and should be treated the same as a stalled renewal for
 * entitlement purposes.
 */
async function handleSubscriptionPaused(payload: Record<string, unknown>): Promise<void> {
  const subEntity = ((payload.subscription as Record<string, unknown> | undefined)?.entity ??
    {}) as Record<string, unknown>
  const razorpaySubscriptionId = String(subEntity.id ?? '')

  if (!razorpaySubscriptionId) {
    logger.warn('subscription.paused: missing subscription id', { payload, module: 'webhook.controller' })
    return
  }

  const existing = await SubscriptionModel.findOne({ razorpaySubscriptionId }).lean<ISubscription>()
  if (!existing) {
    logger.warn('subscription.paused: no local subscription found for razorpaySubscriptionId', {
      razorpaySubscriptionId,
      module: 'webhook.controller',
    })
    return
  }

  const userId = existing.userId

  const updated = await SubscriptionModel.findOneAndUpdate(
    { userId },
    { $set: { status: 'past_due' } },
    { new: true, upsert: false }
  ).lean<ISubscription>()

  if (!updated) {
    logger.warn('subscription.paused: subscription update failed', { userId, module: 'webhook.controller' })
    return
  }

  await invalidateEntitlementCache(userId)

  await recordEvent(
    'subscription.paused',
    userId,
    updated.subscriptionId,
    { razorpaySubscriptionId, raw: payload },
    existing.status,
    'past_due',
    existing.plan,
    existing.plan
  )

  logger.info('Subscription paused at Razorpay — marked past_due locally', { userId, module: 'webhook.controller' })
}

/**
 * subscription.resumed
 *
 * Counterpart to handleSubscriptionPaused — restores 'active' status and
 * clears any retry/grace-period state left over from the pause.
 */
async function handleSubscriptionResumed(payload: Record<string, unknown>): Promise<void> {
  const subEntity = ((payload.subscription as Record<string, unknown> | undefined)?.entity ??
    {}) as Record<string, unknown>
  const razorpaySubscriptionId = String(subEntity.id ?? '')

  if (!razorpaySubscriptionId) {
    logger.warn('subscription.resumed: missing subscription id', { payload, module: 'webhook.controller' })
    return
  }

  const existing = await SubscriptionModel.findOne({ razorpaySubscriptionId }).lean<ISubscription>()
  if (!existing) {
    logger.warn('subscription.resumed: no local subscription found for razorpaySubscriptionId', {
      razorpaySubscriptionId,
      module: 'webhook.controller',
    })
    return
  }

  const userId = existing.userId

  const updated = await SubscriptionModel.findOneAndUpdate(
    { userId },
    {
      $set: {
        status: 'active',
        renewalRetryCount: 0,
        lastRenewalRetryAt: null,
        pastDueGraceEndsAt: null,
      },
    },
    { new: true, upsert: false }
  ).lean<ISubscription>()

  if (!updated) {
    logger.warn('subscription.resumed: subscription update failed', { userId, module: 'webhook.controller' })
    return
  }

  await invalidateEntitlementCache(userId)

  await recordEvent(
    'subscription.resumed',
    userId,
    updated.subscriptionId,
    { razorpaySubscriptionId, raw: payload },
    existing.status,
    'active',
    existing.plan,
    existing.plan
  )

  logger.info('Subscription resumed at Razorpay — marked active locally', { userId, module: 'webhook.controller' })
}

/** refund.created */
async function handleRefundCreated(payload: Record<string, unknown>): Promise<void> {
  const refundEntity = ((payload.refund as Record<string, unknown> | undefined)?.entity ??
    {}) as Record<string, unknown>
  const razorpayPaymentId = String(refundEntity.payment_id ?? '')
  const refundId = String(refundEntity.id ?? '')
  const amount = Number(refundEntity.amount ?? 0) / 100

  if (!razorpayPaymentId) {
    logger.warn('refund.created: missing payment_id', { payload, module: 'webhook.controller' })
    return
  }

  const payment = await PaymentModel.findOneAndUpdate(
    { razorpayPaymentId },
    { $set: { refundId, refundAmount: amount, refundStatus: 'initiated' } },
    { new: true, upsert: false }
  ).lean()

  if (!payment) {
    logger.warn('refund.created: no matching Payment record found', {
      razorpayPaymentId,
      refundId,
      module: 'webhook.controller',
    })
    return
  }

  await recordEvent('refund.created', payment.userId, payment.paymentId, { refundId, amount, raw: payload })

  logger.info('Refund created', { userId: payment.userId, refundId, amount, module: 'webhook.controller' })
}

/**
 * refund.processed
 *
 * Marks the Payment record as refunded. If this was a full refund tied to a
 * subscription that is already cancelled (or scheduled to cancel at period
 * end), the user is downgraded to the free plan immediately — access should
 * not continue once the money backing it has been fully returned.
 */
async function handleRefundProcessed(payload: Record<string, unknown>): Promise<void> {
  const refundEntity = ((payload.refund as Record<string, unknown> | undefined)?.entity ??
    {}) as Record<string, unknown>
  const razorpayPaymentId = String(refundEntity.payment_id ?? '')
  const refundId = String(refundEntity.id ?? '')
  const amount = Number(refundEntity.amount ?? 0) / 100

  if (!razorpayPaymentId) {
    logger.warn('refund.processed: missing payment_id', { payload, module: 'webhook.controller' })
    return
  }

  const payment = await PaymentModel.findOneAndUpdate(
    { razorpayPaymentId },
    { $set: { refundId, refundAmount: amount, refundStatus: 'success', status: 'refunded' } },
    { new: true, upsert: false }
  ).lean()

  if (!payment) {
    logger.warn('refund.processed: no matching Payment record found', {
      razorpayPaymentId,
      refundId,
      module: 'webhook.controller',
    })
    return
  }

  await recordEvent('refund.processed', payment.userId, payment.paymentId, { refundId, amount, raw: payload })

  logger.info('Refund processed', { userId: payment.userId, refundId, amount, module: 'webhook.controller' })

  // Full refund tied to a subscription that is cancelled / cancelling — downgrade to free.
  const isFullRefund = amount >= payment.amount
  if (isFullRefund && payment.razorpaySubscriptionId) {
    const subscription = await SubscriptionModel.findOne({
      razorpaySubscriptionId: payment.razorpaySubscriptionId,
    }).lean<ISubscription>()

    if (subscription && (subscription.cancelAtPeriodEnd || subscription.status === 'cancelled')) {
      const updatedSub = await SubscriptionModel.findOneAndUpdate(
        { userId: subscription.userId },
        { $set: { status: 'cancelled', plan: 'free', cancelAtPeriodEnd: false } },
        { new: true, upsert: false }
      ).lean<ISubscription>()

      if (updatedSub) {
        await invalidateEntitlementCache(subscription.userId)

        await recordEvent(
          'subscription.downgraded_after_refund',
          subscription.userId,
          updatedSub.subscriptionId,
          { refundId, amount, razorpaySubscriptionId: payment.razorpaySubscriptionId },
          subscription.status,
          'cancelled',
          subscription.plan,
          'free'
        )

        logger.info('Full refund processed for cancelled subscription — downgraded to free plan', {
          userId: subscription.userId,
          module: 'webhook.controller',
        })
      }
    }
  }
}

/** refund.failed */
async function handleRefundFailed(payload: Record<string, unknown>): Promise<void> {
  const refundEntity = ((payload.refund as Record<string, unknown> | undefined)?.entity ??
    {}) as Record<string, unknown>
  const razorpayPaymentId = String(refundEntity.payment_id ?? '')
  const refundId = String(refundEntity.id ?? '')

  if (!razorpayPaymentId) {
    logger.warn('refund.failed: missing payment_id', { payload, module: 'webhook.controller' })
    return
  }

  const payment = await PaymentModel.findOneAndUpdate(
    { razorpayPaymentId },
    { $set: { refundId, refundStatus: 'failed' } },
    { new: true, upsert: false }
  ).lean()

  if (!payment) {
    logger.warn('refund.failed: no matching Payment record found', {
      razorpayPaymentId,
      refundId,
      module: 'webhook.controller',
    })
    return
  }

  await recordEvent('refund.failed', payment.userId, payment.paymentId, { refundId, raw: payload })

  logger.warn('Refund failed', { userId: payment.userId, refundId, module: 'webhook.controller' })
}

// ---------------------------------------------------------------------------
// Idempotency key derivation
// ---------------------------------------------------------------------------

/**
 * Razorpay does not reliably send a single top-level event ID field across
 * all API versions in the webhook body. Prefer the `x-razorpay-event-id`
 * header when present; otherwise derive a stable key from the event type +
 * the relevant entity id.
 */
function computeIdempotencyKey(req: Request, eventType: string, payload: Record<string, unknown>): string {
  const headerEventId = req.headers['x-razorpay-event-id']
  if (headerEventId) {
    return String(Array.isArray(headerEventId) ? headerEventId[0] : headerEventId)
  }

  const paymentEntityId = (
    (payload.payment as Record<string, unknown> | undefined)?.entity as Record<string, unknown> | undefined
  )?.id
  const subscriptionEntityId = (
    (payload.subscription as Record<string, unknown> | undefined)?.entity as Record<string, unknown> | undefined
  )?.id
  const refundEntityId = (
    (payload.refund as Record<string, unknown> | undefined)?.entity as Record<string, unknown> | undefined
  )?.id

  const entityId = String(paymentEntityId ?? subscriptionEntityId ?? refundEntityId ?? '')
  return `${eventType}:${entityId}`
}

// ---------------------------------------------------------------------------
// Main controller
// ---------------------------------------------------------------------------

/**
 * handleRazorpayWebhook
 *
 * Express route handler for `POST /api/webhooks/razorpay`.
 *
 * The route MUST be mounted with `express.raw({ type: 'application/json' })`
 * so that `req.body` is a Buffer containing the raw request bytes — the HMAC
 * signature is computed over the raw body and will fail if the body has been
 * parsed and re-serialised.
 */
export async function handleRazorpayWebhook(req: Request, res: Response): Promise<void> {
  // 1. Extract raw body — normalise to Buffer regardless of what arrived.
  //    express.raw() should deliver a Buffer, but if global express.json()
  //    ran first (e.g. Content-Type mismatch), body may be a string or object.
  let rawBody: Buffer
  if (Buffer.isBuffer(req.body)) {
    rawBody = req.body
  } else if (typeof req.body === 'string') {
    rawBody = Buffer.from(req.body, 'utf8')
  } else if (req.body != null) {
    rawBody = Buffer.from(JSON.stringify(req.body), 'utf8')
  } else {
    rawBody = Buffer.alloc(0)
  }

  // 2. Get signature from headers (Razorpay has no separate timestamp header)
  const signature = String(req.headers['x-razorpay-signature'] ?? '')

  // 3. Verify HMAC signature — hex( HMAC-SHA256( RAZORPAY_WEBHOOK_SECRET, rawBody ) )
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET ?? ''
  const isValid = webhookVerifier.verify(rawBody, signature, webhookSecret)
  if (!isValid) {
    const sourceIp = req.ip ?? req.socket.remoteAddress ?? 'unknown'
    logger.warn('Razorpay webhook signature verification failed', {
      module: 'webhook.controller',
      sourceIp,
      signatureProvided: Boolean(signature),
    })
    res.status(401).json({ error: 'Invalid webhook signature' })
    return
  }

  // 4. Parse event
  let event: RazorpayWebhookEvent
  try {
    event = JSON.parse(rawBody.toString()) as RazorpayWebhookEvent
  } catch (err) {
    logger.error('Failed to parse webhook body as JSON', err, { module: 'webhook.controller' })
    res.status(400).json({ error: 'Invalid JSON payload' })
    return
  }

  const eventType = String(event.event ?? '')
  const payload = (event.payload ?? {}) as Record<string, unknown>

  // 5. Idempotency key + check
  const idempotencyKey = computeIdempotencyKey(req, eventType, payload)
  const redis = getRedisClient()

  if (idempotencyKey) {
    const alreadyProcessed = await webhookVerifier.isAlreadyProcessed(idempotencyKey, redis)
    if (alreadyProcessed) {
      logger.debug('Duplicate webhook event — skipping', { idempotencyKey, module: 'webhook.controller' })
      res.status(200).json({ status: 'already_processed' })
      return
    }
  }

  logger.info('Processing Razorpay webhook event', { eventType, idempotencyKey, module: 'webhook.controller' })

  // 6. Route on event type
  try {
    switch (eventType) {
      case 'subscription.activated':
        await handleSubscriptionActivated(payload)
        break

      case 'subscription.charged':
        await handleSubscriptionCharged(payload)
        break

      case 'payment.failed':
        await handlePaymentFailed(payload)
        break

      case 'subscription.cancelled':
        await handleSubscriptionCancelled(payload)
        break

      case 'subscription.paused':
        await handleSubscriptionPaused(payload)
        break

      case 'subscription.resumed':
        await handleSubscriptionResumed(payload)
        break

      case 'refund.created':
        await handleRefundCreated(payload)
        break

      case 'refund.processed':
        await handleRefundProcessed(payload)
        break

      case 'refund.failed':
        await handleRefundFailed(payload)
        break

      case 'payment.authorized':
      case 'payment.captured':
        // These fire alongside subscription.activated / subscription.charged
        // for subscription-linked payments — access is granted via those
        // subscription-level events, so no further action is needed here.
        logger.debug('Payment lifecycle event acknowledged (handled via subscription.* events)', {
          eventType,
          module: 'webhook.controller',
        })
        break

      default:
        logger.info('Unhandled Razorpay webhook event type — acknowledging', {
          eventType,
          idempotencyKey,
          allEventData: JSON.stringify(event).slice(0, 500),
          module: 'webhook.controller',
        })
    }
  } catch (err) {
    // Log and still return 200 to prevent Razorpay retrying indefinitely.
    // The event has been verified and parsed; a processing error should be
    // investigated separately rather than triggering retries.
    logger.error('Error processing Razorpay webhook event', err, {
      eventType,
      idempotencyKey,
      module: 'webhook.controller',
    })
  }

  // 7. Mark event as processed
  if (idempotencyKey) {
    await webhookVerifier.markProcessed(idempotencyKey, redis)
  }

  // 8. Acknowledge
  res.status(200).json({ status: 'ok' })
}
