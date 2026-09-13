/**
 * SubscriptionRepository
 *
 * Data-access layer for the Subscription collection. All writes use Mongoose
 * atomic operations. `updateStatus` additionally writes a SubscriptionEvent
 * document in the same logical operation (two sequential writes — MongoDB
 * does not support multi-collection transactions without a replica-set, so
 * the event write follows the subscription update; both writes are attempted
 * and errors are surfaced to the caller).
 *
 * Satisfies Requirements: 2.1, 2.4, 2.8, 10.6
 */

import SubscriptionModel, {
  type ISubscription,
  type SubscriptionStatus,
} from '../models/SubscriptionModel'
import { SubscriptionEventModel } from '../models/SubscriptionEventModel'
import { v4 as uuidv4 } from 'uuid'

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class SubscriptionRepository {
  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  /**
   * Find the subscription document for a given user.
   * Returns null if no subscription exists yet.
   *
   * ID-FORMAT ROBUSTNESS: subscriptions are created with the Veefore user's
   * Mongo `_id` (from `req.user.id`), but some callers pass the Firebase UID
   * instead (e.g. workspace routes that resolve `req.user.firebaseUid`). A
   * plain `findOne({ userId })` silently missed in those cases, causing the
   * user to be treated as free (wrong plan/limits). We now try the id as-is
   * first, then fall back to resolving the Mongo `_id` from the Firebase UID
   * (and vice-versa) so the lookup succeeds regardless of which id shape the
   * caller passed.
   */
  async findByUserId(userId: string): Promise<ISubscription | null> {
    const direct = await SubscriptionModel.findOne({ userId }).lean<ISubscription>()
    if (direct) return direct

    // Fall back: resolve the alternate id form (mongo _id ↔ firebaseUid).
    try {
      const { User } = await import('../../../../models/User/User')
      const isObjectId = /^[a-f0-9]{24}$/i.test(userId)
      const user = await User.findOne(
        isObjectId ? { _id: userId } : { firebaseUid: userId },
      )
        .select('_id firebaseUid')
        .lean()
        .catch(() => null)
      if (!user) return null

      // Try both alternate ids the user might have been stored under.
      const candidates = [String((user as any)._id), (user as any).firebaseUid].filter(
        (v): v is string => Boolean(v) && v !== userId,
      )
      if (candidates.length === 0) return null

      return SubscriptionModel.findOne({ userId: { $in: candidates } }).lean<ISubscription>()
    } catch {
      return null
    }
  }

  /**
   * Return all subscriptions with the specified status.
   * Useful for admin views and cron jobs that operate on a status bucket.
   */
  async findByStatus(status: SubscriptionStatus): Promise<ISubscription[]> {
    return SubscriptionModel.find({ status }).lean<ISubscription[]>()
  }

  /**
   * Return subscriptions where `currentPeriodEnd` is in the past and status
   * is still 'active'. Consumed by the daily expiry-check cron job.
   */
  async findExpired(): Promise<ISubscription[]> {
    return SubscriptionModel.find({
      status: 'active',
      currentPeriodEnd: { $lt: new Date() },
    }).lean<ISubscription[]>()
  }

  /**
   * Return active subscriptions whose `nextBillingDate` falls within the
   * next `daysAhead` days. Used by the pre-renewal notification job.
   */
  async findDueForRenewal(daysAhead: number): Promise<ISubscription[]> {
    const now = new Date()
    const cutoff = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000)

    return SubscriptionModel.find({
      status: 'active',
      nextBillingDate: { $gte: now, $lte: cutoff },
    }).lean<ISubscription[]>()
  }

  /**
   * Return subscriptions with status 'payment_failed' whose grace window has
   * expired. The `gracePeriodEndsAt` field is the authoritative cutoff stored
   * at the time of the payment failure; `graceDays` is provided as a fallback
   * so callers can also enforce a ceiling when `gracePeriodEndsAt` is null.
   * Consumed by the grace-period-check cron job.
   */
  async findPaymentFailedPastGrace(graceDays: number): Promise<ISubscription[]> {
    const fallbackCutoff = new Date(Date.now() - graceDays * 24 * 60 * 60 * 1000)

    return SubscriptionModel.find({
      status: 'payment_failed',
      $or: [
        // Preferred: explicit grace end date has passed.
        { gracePeriodEndsAt: { $lt: new Date() } },
        // Fallback: no explicit end date set, but graceDays have elapsed since updatedAt.
        { gracePeriodEndsAt: null, updatedAt: { $lt: fallbackCutoff } },
      ],
    }).lean<ISubscription[]>()
  }

  /**
   * Return subscriptions with status 'past_due' (Razorpay renewal-retry
   * failure) whose grace window has expired. The `pastDueGraceEndsAt` field
   * is the authoritative cutoff stored at the time of the first failed
   * retry in the current cycle; `graceDays` is provided as a fallback so
   * callers can also enforce a ceiling when `pastDueGraceEndsAt` is null.
   * Consumed by the grace-period-check cron job.
   */
  async findPastDuePastGrace(graceDays: number): Promise<ISubscription[]> {
    const fallbackCutoff = new Date(Date.now() - graceDays * 24 * 60 * 60 * 1000)

    return SubscriptionModel.find({
      status: 'past_due',
      $or: [
        // Preferred: explicit grace end date has passed.
        { pastDueGraceEndsAt: { $lt: new Date() } },
        // Fallback: no explicit end date set, but graceDays have elapsed since updatedAt.
        { pastDueGraceEndsAt: null, updatedAt: { $lt: fallbackCutoff } },
      ],
    }).lean<ISubscription[]>()
  }

  // -------------------------------------------------------------------------
  // Writes
  // -------------------------------------------------------------------------

  /**
   * Create or update the subscription document for a user (upsert by userId).
   * Uses `findOneAndUpdate` with `upsert: true` so the operation is atomic and
   * safe to call on first-time subscription creation or subsequent updates.
   *
   * Returns the resulting document (post-update).
   */
  async upsert(data: Partial<ISubscription>): Promise<ISubscription> {
    const { userId, ...rest } = data as Partial<ISubscription> & { userId: string }

    if (!userId) {
      throw new Error('SubscriptionRepository.upsert: userId is required')
    }

    const result = await SubscriptionModel.findOneAndUpdate(
      { userId },
      [
        {
          $set: {
            ...rest,
            // If subscriptionId is already present in the doc, keep it.
            // If it's missing (old document), generate one now.
            subscriptionId: {
              $ifNull: ['$subscriptionId', rest.subscriptionId ?? uuidv4()],
            },
          },
        },
      ],
      {
        upsert: true,
        new: true,       // return post-update document
        setDefaultsOnInsert: true,
      }
    ).lean<ISubscription>()

    if (!result) {
      throw new Error(
        `SubscriptionRepository.upsert: unexpected null result for userId=${userId}`
      )
    }

    return result
  }

  /**
   * Atomically update the subscription status for a user and write a
   * corresponding SubscriptionEvent audit document.
   *
   * Steps:
   *  1. Read the current document to capture previousStatus / previousPlan.
   *  2. Atomically apply the status update via findOneAndUpdate.
   *  3. Insert a SubscriptionEvent document capturing the full transition.
   *
   * Returns the updated subscription, or null if no document exists for the
   * given userId.
   */
  async updateStatus(
    userId: string,
    status: SubscriptionStatus,
    metadata: Record<string, unknown>,
    triggeredBy: 'webhook' | 'admin' | 'user' | 'cron',
    adminUserId?: string
  ): Promise<ISubscription | null> {
    // Step 1 — read current state so we can populate the event's previousXxx fields.
    const existing = await SubscriptionModel.findOne({ userId }).lean<ISubscription>()
    if (!existing) {
      return null
    }

    // Step 2 — atomic status update.
    const updated = await SubscriptionModel.findOneAndUpdate(
      { userId },
      { $set: { status } },
      { new: true }
    ).lean<ISubscription>()

    if (!updated) {
      // Extremely unlikely between the findOne and this call, but guard it.
      return null
    }

    // Step 3 — write the audit event.
    await SubscriptionEventModel.create({
      eventType: 'subscription.status_changed',
      userId,
      subscriptionId: existing.subscriptionId,
      previousStatus: existing.status,
      newStatus: status,
      previousPlan: existing.plan,
      newPlan: updated.plan,
      triggeredBy,
      ...(adminUserId !== undefined && { adminUserId }),
      metadata,
      timestamp: new Date(),
    })

    return updated
  }
}

// ---------------------------------------------------------------------------
// Singleton export — matches the lazy-init pattern used across the codebase
// ---------------------------------------------------------------------------

let _instance: SubscriptionRepository | null = null

export function getSubscriptionRepository(): SubscriptionRepository {
  if (!_instance) {
    _instance = new SubscriptionRepository()
  }
  return _instance
}

export default SubscriptionRepository
