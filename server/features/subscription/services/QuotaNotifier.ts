/**
 * QuotaNotifier — Subscription notification service.
 *
 * Handles all threshold alerts (80 / 90 / 100 %), pre-renewal notices,
 * payment failure notifications, cancellation confirmations, and credit
 * purchase confirmations.
 *
 * Deduplication: every notification is gated by a Redis key so the same
 * alert is never sent twice within the same billing cycle / calendar day.
 *
 * Every sent notification is persisted to MongoDB via NotificationLogModel
 * for audit and de-dup purposes.
 *
 * Satisfies Requirements: 9.7, 9.8, 9.9, 10.6, 13.1–13.7
 */

import { type Redis } from 'ioredis'
import mongoose, { Schema } from 'mongoose'
import { PLAN_CONFIG, type PlanId } from '../../../config/plan-config'
import { type ISubscription } from '../db/models/SubscriptionModel'
import logger from '../../../config/logger'

// ---------------------------------------------------------------------------
// QuotaType — the five quota dimensions tracked by the notifier
// ---------------------------------------------------------------------------

export type QuotaType =
  | 'ai_credits'
  | 'keyword_conversations'
  | 'ai_conversations'
  | 'follow_campaign_conversations'
  | 'scheduled_posts'

// ---------------------------------------------------------------------------
// Notification thresholds (percent consumed)
// ---------------------------------------------------------------------------

const QUOTA_THRESHOLDS = [80, 90, 100] as const
type Threshold = (typeof QUOTA_THRESHOLDS)[number]

// ---------------------------------------------------------------------------
// NotificationLog Mongoose model (inline)
// ---------------------------------------------------------------------------

export interface INotificationLog {
  notificationType: string
  userId: string
  sentAt: Date
  channel: 'email' | 'in-app'
  metadata: Record<string, unknown>
}

const NotificationLogSchema = new Schema<INotificationLog>(
  {
    notificationType: { type: String, required: true },
    userId: { type: String, required: true },
    sentAt: { type: Date, required: true, default: () => new Date() },
    channel: { type: String, enum: ['email', 'in-app'], required: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: false }
)

NotificationLogSchema.index({ userId: 1, notificationType: 1, sentAt: -1 })

const NotificationLogModel =
  (mongoose.models.NotificationLog as mongoose.Model<INotificationLog>) ||
  mongoose.model<INotificationLog>('NotificationLog', NotificationLogSchema)

// ---------------------------------------------------------------------------
// Internal email stub
// Actual integration will connect to the existing email service later.
// ---------------------------------------------------------------------------

async function sendEmail(to: string, subject: string, body: string): Promise<void> {
  logger.info('Email sent', {
    module: 'subscription',
    action: 'email_sent',
    to,
    subject,
    bodyPreview: body.slice(0, 120),
  } as Record<string, unknown>)
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/**
 * Returns the current billing cycle start as a "YYYY-MM" string.
 * This is used as the dedup key segment so the same threshold is only
 * sent once per calendar month.
 */
function currentCycleStart(): string {
  const now = new Date()
  const yyyy = now.getUTCFullYear()
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  return `${yyyy}-${mm}`
}

/** Format a Date as "YYYY-MM-DD" (UTC). */
function toDateString(date: Date): string {
  const yyyy = date.getUTCFullYear()
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(date.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/** Today as "YYYY-MM-DD" (UTC). */
function todayString(): string {
  return toDateString(new Date())
}

/**
 * Compute the number of seconds remaining until midnight UTC at the end
 * of the current month.  Used to set TTLs on per-cycle dedup keys.
 */
function secondsUntilEndOfMonth(): number {
  const now = new Date()
  // First day of next month, midnight UTC
  const endOfMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0)
  )
  return Math.max(1, Math.floor((endOfMonth.getTime() - now.getTime()) / 1000))
}

// ---------------------------------------------------------------------------
// QuotaNotifier
// ---------------------------------------------------------------------------

export class QuotaNotifier {
  // -------------------------------------------------------------------------
  // 1. checkAndNotify
  // -------------------------------------------------------------------------

  /**
   * Check whether any quota threshold (80 / 90 / 100 %) has been crossed for
   * the given user and quota dimension, and send notifications for any
   * threshold that has not already been sent this billing cycle.
   *
   * @param userId    - The user whose quota changed.
   * @param quotaType - Which quota dimension is being checked.
   * @param used      - Units consumed so far this cycle.
   * @param limit     - Maximum units for this cycle.
   * @param redis     - Shared ioredis client (passed in to keep the class stateless).
   */
  async checkAndNotify(
    userId: string,
    quotaType: QuotaType,
    used: number,
    limit: number,
    redis: Redis
  ): Promise<void> {
    if (limit <= 0) {
      // Unlimited plan (limit === -1 expressed as Infinity, or 0 meaning N/A)
      return
    }

    const percentage = (used / limit) * 100
    const cycleStart = currentCycleStart()

    for (const threshold of QUOTA_THRESHOLDS) {
      if (percentage < threshold) {
        // Threshold not yet reached — remaining thresholds are higher, skip all
        break
      }

      const dedupKey = `sub:notification:${userId}:${quotaType}:${threshold}:${cycleStart}`
      const alreadySent = await redis.exists(dedupKey)

      if (alreadySent) {
        // Already notified for this threshold this cycle
        continue
      }

      // --- Send in-app notification (stub; realtime service wires this up) ---
      logger.info(`Quota threshold reached: ${threshold}%`, {
        module: 'subscription',
        action: 'quota_threshold_alert',
        userId,
        quotaType,
        threshold,
        used,
        limit,
        percentage: percentage.toFixed(1),
      } as Record<string, unknown>)

      // --- Send email ---
      const subject = this._quotaEmailSubject(quotaType, threshold)
      const body = this._quotaEmailBody(userId, quotaType, threshold, used, limit)
      await sendEmail(userId, subject, body)

      // --- Persist to MongoDB ---
      await NotificationLogModel.create({
        notificationType: `quota_${quotaType}_${threshold}`,
        userId,
        sentAt: new Date(),
        channel: 'email',
        metadata: { quotaType, threshold, used, limit, cycleStart },
      })
      await NotificationLogModel.create({
        notificationType: `quota_${quotaType}_${threshold}`,
        userId,
        sentAt: new Date(),
        channel: 'in-app',
        metadata: { quotaType, threshold, used, limit, cycleStart },
      })

      // --- Set dedup key (expires at end of current billing cycle) ---
      const ttl = secondsUntilEndOfMonth()
      await redis.set(dedupKey, '1', 'EX', ttl)
    }
  }

  // -------------------------------------------------------------------------
  // 2. sendPreRenewalNotification
  // -------------------------------------------------------------------------

  /**
   * Send an email reminder 3 days before the subscription renews.
   * Deduped per nextBillingDate so it fires exactly once per renewal cycle.
   *
   * @param subscription - The subscription document about to renew.
   * @param redis        - Shared ioredis client.
   */
  async sendPreRenewalNotification(
    subscription: ISubscription,
    redis: Redis
  ): Promise<void> {
    const userId = subscription.userId
    const billingDateStr = toDateString(subscription.nextBillingDate)
    const dedupKey = `sub:notification:${userId}:pre_renewal:${billingDateStr}`

    const alreadySent = await redis.exists(dedupKey)
    if (alreadySent) {
      return
    }

    // Derive renewal amount from plan pricing
    const planConfig = PLAN_CONFIG[subscription.plan as PlanId]
    const renewalAmountPaise =
      subscription.billingCycle === 'yearly'
        ? planConfig.pricing.yearly
        : planConfig.pricing.monthly

    const renewalAmountINR = (renewalAmountPaise / 100).toFixed(2)

    const subject = `Your Veefore subscription renews on ${billingDateStr}`
    const body = [
      `Hi,`,
      ``,
      `This is a reminder that your Veefore ${planConfig.name} plan will renew on ${billingDateStr}.`,
      `Renewal amount: ₹${renewalAmountINR}`,
      ``,
      `To manage your billing, visit: https://app.veefore.com/settings/billing`,
      ``,
      `Thanks for being a Veefore subscriber!`,
    ].join('\n')

    await sendEmail(userId, subject, body)

    logger.info('Pre-renewal notification sent', {
      module: 'subscription',
      action: 'pre_renewal_notification',
      userId,
      billingDateStr,
      renewalAmountPaise,
    } as Record<string, unknown>)

    await NotificationLogModel.create({
      notificationType: 'pre_renewal',
      userId,
      sentAt: new Date(),
      channel: 'email',
      metadata: { billingDateStr, renewalAmountPaise, plan: subscription.plan },
    })

    // TTL: 8 days covers the 3-day look-ahead window with some buffer
    await redis.set(dedupKey, '1', 'EX', 8 * 24 * 60 * 60)
  }

  // -------------------------------------------------------------------------
  // 3. sendPaymentFailedNotification
  // -------------------------------------------------------------------------

  /**
   * Send an immediate payment failure email.
   * Deduped per calendar day so the user is not bombarded on the same day.
   *
   * @param userId - The user whose payment failed.
   * @param redis  - Shared ioredis client.
   */
  async sendPaymentFailedNotification(userId: string, redis: Redis): Promise<void> {
    const today = todayString()
    const dedupKey = `sub:notification:${userId}:payment_failed:${today}`

    const alreadySent = await redis.exists(dedupKey)
    if (alreadySent) {
      return
    }

    const subject = 'Action required: Your Veefore payment failed'
    const body = [
      `Hi,`,
      ``,
      `We were unable to process your recent Veefore subscription payment.`,
      ``,
      `To keep your premium features active, please update your payment method:`,
      `https://app.veefore.com/settings/billing`,
      ``,
      `You have a 3-day grace period before access to premium features is restricted.`,
      ``,
      `If you have any questions, please contact our support team.`,
    ].join('\n')

    await sendEmail(userId, subject, body)

    logger.info('Payment failed notification sent', {
      module: 'subscription',
      action: 'payment_failed_notification',
      userId,
      today,
    } as Record<string, unknown>)

    await NotificationLogModel.create({
      notificationType: 'payment_failed',
      userId,
      sentAt: new Date(),
      channel: 'email',
      metadata: { date: today },
    })

    // Dedup for the rest of the day (24 hours)
    await redis.set(dedupKey, '1', 'EX', 24 * 60 * 60)
  }

  // -------------------------------------------------------------------------
  // 4. sendCancellationConfirmation
  // -------------------------------------------------------------------------

  /**
   * Send a cancellation confirmation email showing when premium access ends.
   * Deduped by userId + 'cancellation' + date so it fires once per day at most.
   *
   * @param userId       - The user who cancelled.
   * @param accessEndsAt - The date when premium access reverts to free plan.
   * @param redis        - Shared ioredis client.
   */
  async sendCancellationConfirmation(
    userId: string,
    accessEndsAt: Date,
    redis: Redis
  ): Promise<void> {
    const today = todayString()
    const accessEndsAtStr = toDateString(accessEndsAt)
    const dedupKey = `sub:notification:${userId}:cancellation:${today}`

    const alreadySent = await redis.exists(dedupKey)
    if (alreadySent) {
      return
    }

    const subject = 'Your Veefore subscription has been cancelled'
    const body = [
      `Hi,`,
      ``,
      `Your Veefore subscription has been cancelled.`,
      ``,
      `You will continue to have access to your premium features until ${accessEndsAtStr}.`,
      `After that date, your account will revert to the Free plan.`,
      ``,
      `If you change your mind, you can reactivate your subscription at any time:`,
      `https://app.veefore.com/settings/billing`,
      ``,
      `Thank you for using Veefore.`,
    ].join('\n')

    await sendEmail(userId, subject, body)

    logger.info('Cancellation confirmation sent', {
      module: 'subscription',
      action: 'cancellation_confirmation',
      userId,
      accessEndsAtStr,
    } as Record<string, unknown>)

    await NotificationLogModel.create({
      notificationType: 'cancellation_confirmation',
      userId,
      sentAt: new Date(),
      channel: 'email',
      metadata: { accessEndsAt: accessEndsAtStr },
    })

    // Dedup for the rest of the day
    await redis.set(dedupKey, '1', 'EX', 24 * 60 * 60)
  }

  // -------------------------------------------------------------------------
  // 5. sendCreditPurchaseConfirmation
  // -------------------------------------------------------------------------

  /**
   * Send a credit purchase confirmation.  No dedup needed — each purchase is
   * a distinct one-time event that always warrants a receipt.
   *
   * @param userId       - The user who purchased credits.
   * @param creditsAdded - Number of credits just added.
   * @param newBalance   - The user's total remaining credit balance after purchase.
   */
  async sendCreditPurchaseConfirmation(
    userId: string,
    creditsAdded: number,
    newBalance: number
  ): Promise<void> {
    const subject = `You've added ${creditsAdded} AI credits to your Veefore account`
    const body = [
      `Hi,`,
      ``,
      `Your AI credit purchase was successful!`,
      ``,
      `Credits added:  ${creditsAdded}`,
      `New balance:    ${newBalance}`,
      ``,
      `Your credits are ready to use immediately across all AI features.`,
      ``,
      `Visit your dashboard: https://app.veefore.com`,
    ].join('\n')

    await sendEmail(userId, subject, body)

    logger.info('Credit purchase confirmation sent', {
      module: 'subscription',
      action: 'credit_purchase_confirmation',
      userId,
      creditsAdded,
      newBalance,
    } as Record<string, unknown>)

    await NotificationLogModel.create({
      notificationType: 'credit_purchase_confirmation',
      userId,
      sentAt: new Date(),
      channel: 'email',
      metadata: { creditsAdded, newBalance },
    })
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private _quotaEmailSubject(quotaType: QuotaType, threshold: Threshold): string {
    const label = this._quotaLabel(quotaType)
    if (threshold === 100) {
      return `You've used all your Veefore ${label}`
    }
    return `Veefore alert: ${threshold}% of your ${label} used`
  }

  private _quotaEmailBody(
    userId: string,
    quotaType: QuotaType,
    threshold: Threshold,
    used: number,
    limit: number
  ): string {
    const label = this._quotaLabel(quotaType)
    const remaining = Math.max(0, limit - used)
    const urgency =
      threshold === 100
        ? 'You have no remaining units — AI operations requiring this quota are now blocked.'
        : threshold === 90
          ? 'You are running critically low on this quota.'
          : 'You are approaching your quota limit.'

    return [
      `Hi,`,
      ``,
      `${urgency}`,
      ``,
      `${label}: ${used} / ${limit} used (${threshold}%)`,
      `Remaining: ${remaining}`,
      ``,
      `To increase your quota, upgrade your plan or purchase an add-on:`,
      `https://app.veefore.com/settings/billing`,
      ``,
      `— The Veefore Team`,
    ].join('\n')
  }

  private _quotaLabel(quotaType: QuotaType): string {
    const labels: Record<QuotaType, string> = {
      ai_credits: 'AI credits',
      keyword_conversations: 'keyword trigger conversations',
      ai_conversations: 'AI-powered conversations',
      follow_campaign_conversations: 'follow campaign conversations',
      scheduled_posts: 'scheduled posts',
    }
    return labels[quotaType]
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const quotaNotifier = new QuotaNotifier()

// Export model for use in other services if needed
export { NotificationLogModel }
