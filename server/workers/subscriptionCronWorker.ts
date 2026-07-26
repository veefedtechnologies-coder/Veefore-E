/**
 * subscriptionCronWorker.ts
 *
 * BullMQ worker that processes periodic subscription lifecycle maintenance jobs
 * dispatched by the subscription-cron-queue.
 *
 * Job types handled:
 *  - daily_expiry_check         Expire overdue active subscriptions
 *  - grace_period_check         Downgrade past_due subs past grace window
 *  - reconciliation             Sync local status against Razorpay
 *  - monthly_quota_reset        Reset AI credit quotas on billing anniversary
 *  - pre_renewal_notifications  Send renewal reminders 3 days before next billing
 *
 * Worker config: concurrency=1 (cron jobs should not run concurrently).
 * Follows the lazy-init singleton pattern from researchWorker.ts.
 *
 * Satisfies Requirements: 3.1–3.5, 4.1–4.4, 9.2, 13.5
 */

import { Worker, type Job } from 'bullmq';
import { getSharedRedisConnection } from '../lib/redis';
import { type CronJobType, type SubscriptionCronJobData } from '../queues/subscriptionCronQueue';
import SubscriptionRepository from '../features/subscription/db/repositories/SubscriptionRepository';
import { AICreditsRepository } from '../features/subscription/db/repositories/AICreditsRepository';
import { SubscriptionEventModel } from '../features/subscription/db/models/SubscriptionEventModel';
import SubscriptionModel from '../features/subscription/db/models/SubscriptionModel';
import { PLAN_CONFIG } from '../config/plan-config';
import { razorpaySubscriptionService } from '../features/subscription/services/RazorpaySubscriptionService';
import { quotaNotifier } from '../features/subscription/services/QuotaNotifier';
import logger from '../config/logger';

// ---------------------------------------------------------------------------
// Singletons
// ---------------------------------------------------------------------------

const subscriptionRepo = new SubscriptionRepository();
const aiCreditsRepo = new AICreditsRepository();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute the next billing date by advancing one month or one year from the
 * supplied base date, matching the subscription's billingCycle.
 */
function computeNextBillingDate(from: Date, billingCycle: 'monthly' | 'yearly'): Date {
  const next = new Date(from);
  if (billingCycle === 'yearly') {
    next.setFullYear(next.getFullYear() + 1);
  } else {
    next.setMonth(next.getMonth() + 1);
  }
  return next;
}

// ---------------------------------------------------------------------------
// Job handlers
// ---------------------------------------------------------------------------

/**
 * 1. daily_expiry_check
 *
 * Finds all active subscriptions where `currentPeriodEnd < now`, marks them
 * as 'expired', downgrades plan to 'free', writes a SubscriptionEvent audit
 * record, and deletes the Redis entitlement cache key for the user.
 */
async function handleDailyExpiryCheck(): Promise<void> {
  const redis = getSharedRedisConnection();
  const expired = await subscriptionRepo.findExpired();

  logger.info(`[subscription-cron] daily_expiry_check: found ${expired.length} subscription(s) to expire`);

  for (const sub of expired) {
    try {
      await SubscriptionModel.findOneAndUpdate(
        { userId: sub.userId },
        { $set: { status: 'expired', plan: 'free' } },
      );

      await SubscriptionEventModel.create({
        eventType: 'subscription.expired',
        userId: sub.userId,
        subscriptionId: sub.subscriptionId,
        previousStatus: sub.status,
        newStatus: 'expired',
        previousPlan: sub.plan,
        newPlan: 'free',
        triggeredBy: 'cron',
        metadata: { reason: 'daily_expiry_check', currentPeriodEnd: sub.currentPeriodEnd },
        timestamp: new Date(),
      });

      // Invalidate entitlement cache
      await redis.del(`sub:entitlement:${sub.userId}`);

      logger.info(`[subscription-cron] daily_expiry_check: expired userId=${sub.userId}`, {
        module: 'subscription',
        action: 'daily_expiry_check',
        userId: sub.userId,
        previousPlan: sub.plan,
        currentPeriodEnd: sub.currentPeriodEnd,
      });
    } catch (err) {
      logger.error(
        `[subscription-cron] daily_expiry_check: error processing userId=${sub.userId}`,
        err instanceof Error ? err : new Error(String(err)),
        { module: 'subscription', action: 'daily_expiry_check', userId: sub.userId },
      );
    }
  }
}

/**
 * 2. grace_period_check
 *
 * Finds all 'past_due' subscriptions (Razorpay renewal-retry failures)
 * whose grace period has elapsed, fully cancels them (mirrors the
 * webhook controller's grace-expired → fully cancel transition), and
 * invalidates the entitlement cache.
 */
async function handleGracePeriodCheck(): Promise<void> {
  const redis = getSharedRedisConnection();
  const pastGrace = await subscriptionRepo.findPastDuePastGrace(3);

  logger.info(`[subscription-cron] grace_period_check: found ${pastGrace.length} subscription(s) past grace`);

  for (const sub of pastGrace) {
    try {
      await SubscriptionModel.findOneAndUpdate(
        { userId: sub.userId },
        {
          $set: {
            status: 'cancelled',
            plan: 'free',
            cancelAtPeriodEnd: false,
            pastDueGraceEndsAt: null,
            renewalRetryCount: 0,
            lastRenewalRetryAt: null,
          },
        },
      );

      // Invalidate entitlement cache
      await redis.del(`sub:entitlement:${sub.userId}`);

      logger.info(`[subscription-cron] grace_period_check: downgraded userId=${sub.userId} to free`, {
        module: 'subscription',
        action: 'grace_period_check',
        userId: sub.userId,
        previousPlan: sub.plan,
        pastDueGraceEndsAt: sub.pastDueGraceEndsAt,
      });
    } catch (err) {
      logger.error(
        `[subscription-cron] grace_period_check: error processing userId=${sub.userId}`,
        err instanceof Error ? err : new Error(String(err)),
        { module: 'subscription', action: 'grace_period_check', userId: sub.userId },
      );
    }
  }
}

/**
 * 3. reconciliation
 *
 * Iterates active paid subscriptions and compares their local status against
 * Razorpay. Razorpay subscription status values are lowercase strings —
 * mapped to local statuses as follows:
 *   'cancelled'          → local 'cancelled'
 *   'completed'/'expired' → local 'expired'
 *   'halted'              → local 'past_due' (all automatic retries exhausted)
 */
async function handleReconciliation(): Promise<void> {
  const redis = getSharedRedisConnection();
  // Find active subscriptions on paid plans
  const activeSubs = await subscriptionRepo.findByStatus('active');
  const paidSubs = activeSubs.filter((s) => s.plan !== 'free');

  logger.info(`[subscription-cron] reconciliation: checking ${paidSubs.length} active paid subscription(s)`);

  for (const sub of paidSubs) {
    if (!sub.razorpaySubscriptionId) {
      // No Razorpay reference — nothing to reconcile
      continue;
    }

    try {
      const razorpaySub = await razorpaySubscriptionService.getSubscription(sub.razorpaySubscriptionId);
      const razorpayStatus = String(razorpaySub.status ?? '').toLowerCase();

      if (razorpayStatus === 'cancelled' || razorpayStatus === 'completed' || razorpayStatus === 'expired' || razorpayStatus === 'halted') {
        logger.warn(`[subscription-cron] reconciliation: discrepancy for userId=${sub.userId}`, {
          module: 'subscription',
          action: 'reconciliation',
          userId: sub.userId,
          razorpaySubscriptionId: sub.razorpaySubscriptionId,
          localStatus: sub.status,
          razorpayStatus,
        });

        const newLocalStatus =
          razorpayStatus === 'cancelled'
            ? 'cancelled'
            : razorpayStatus === 'halted'
              ? 'past_due'
              : 'expired'; // 'completed' or 'expired'

        await SubscriptionModel.findOneAndUpdate(
          { userId: sub.userId },
          { $set: { status: newLocalStatus } },
        );

        await SubscriptionEventModel.create({
          eventType: 'subscription.reconciled',
          userId: sub.userId,
          subscriptionId: sub.subscriptionId,
          previousStatus: sub.status,
          newStatus: newLocalStatus,
          previousPlan: sub.plan,
          newPlan: sub.plan,
          triggeredBy: 'cron',
          metadata: {
            reason: 'reconciliation',
            razorpayStatus,
            razorpaySubscriptionId: sub.razorpaySubscriptionId,
          },
          timestamp: new Date(),
        });

        // Invalidate entitlement cache after status correction
        await redis.del(`sub:entitlement:${sub.userId}`);
      }
    } catch (err) {
      // Per-subscription error: log and continue batch
      logger.error(
        `[subscription-cron] reconciliation: error checking userId=${sub.userId}`,
        err instanceof Error ? err : new Error(String(err)),
        {
          module: 'subscription',
          action: 'reconciliation',
          userId: sub.userId,
          razorpaySubscriptionId: sub.razorpaySubscriptionId,
        },
      );
    }
  }
}

/**
 * 4. monthly_quota_reset
 *
 * Finds subscriptions whose `nextBillingDate` is today and resets the user's
 * AI credits for the new billing cycle. Updates `nextBillingDate` on the
 * subscription document and logs before/after credit state.
 */
async function handleMonthlyQuotaReset(): Promise<void> {
  // findDueForRenewal(0) returns subscriptions where nextBillingDate <= now
  const dueToday = await subscriptionRepo.findDueForRenewal(0);

  logger.info(`[subscription-cron] monthly_quota_reset: found ${dueToday.length} subscription(s) due for renewal`);

  for (const sub of dueToday) {
    try {
      const planConfig = PLAN_CONFIG[sub.plan];
      const planCredits = planConfig?.limits?.aiCreditsPerMonth ?? 0;
      const nextNextBillingDate = computeNextBillingDate(sub.nextBillingDate, sub.billingCycle);

      // Read credits before reset for logging
      const beforeCredits = await aiCreditsRepo.findByUserId(sub.userId);

      await aiCreditsRepo.resetMonthly(sub.userId, planCredits, nextNextBillingDate);

      // Advance nextBillingDate on the subscription
      await SubscriptionModel.findOneAndUpdate(
        { userId: sub.userId },
        { $set: { nextBillingDate: nextNextBillingDate } },
      );

      const afterCredits = await aiCreditsRepo.findByUserId(sub.userId);

      logger.info(`[subscription-cron] monthly_quota_reset: reset userId=${sub.userId}`, {
        module: 'subscription',
        action: 'monthly_quota_reset',
        userId: sub.userId,
        plan: sub.plan,
        planCredits,
        previousNextBillingDate: sub.nextBillingDate,
        nextNextBillingDate,
        creditsBefore: beforeCredits?.remainingCredits ?? 'unknown',
        creditsAfter: afterCredits?.remainingCredits ?? 'unknown',
      });
    } catch (err) {
      logger.error(
        `[subscription-cron] monthly_quota_reset: error processing userId=${sub.userId}`,
        err instanceof Error ? err : new Error(String(err)),
        { module: 'subscription', action: 'monthly_quota_reset', userId: sub.userId },
      );
    }
  }
}

/**
 * 5. pre_renewal_notifications
 *
 * Finds subscriptions where `nextBillingDate` is exactly 3 days away (not
 * "within 3 days") and dispatches pre-renewal reminder notifications.
 */
async function handlePreRenewalNotifications(): Promise<void> {
  const redis = getSharedRedisConnection();
  // findDueForRenewal(3) returns subscriptions with nextBillingDate <= now+3d
  const candidates = await subscriptionRepo.findDueForRenewal(3);

  // Only notify subscriptions whose nextBillingDate falls on the same UTC
  // calendar date as (today + 3 days) — not "within 3 days".
  const now = new Date();
  const threeDaysFromNow = new Date(now);
  threeDaysFromNow.setUTCDate(threeDaysFromNow.getUTCDate() + 3);

  const dueInExactlyThreeDays = candidates.filter((sub) => {
    const bd = sub.nextBillingDate;
    return (
      bd.getUTCFullYear() === threeDaysFromNow.getUTCFullYear() &&
      bd.getUTCMonth() === threeDaysFromNow.getUTCMonth() &&
      bd.getUTCDate() === threeDaysFromNow.getUTCDate()
    );
  });

  logger.info(
    `[subscription-cron] pre_renewal_notifications: sending to ${dueInExactlyThreeDays.length} subscription(s)`,
  );

  for (const sub of dueInExactlyThreeDays) {
    try {
      await quotaNotifier.sendPreRenewalNotification(sub, redis);

      logger.info(`[subscription-cron] pre_renewal_notifications: sent for userId=${sub.userId}`, {
        module: 'subscription',
        action: 'pre_renewal_notifications',
        userId: sub.userId,
        nextBillingDate: sub.nextBillingDate,
      });
    } catch (err) {
      logger.error(
        `[subscription-cron] pre_renewal_notifications: error for userId=${sub.userId}`,
        err instanceof Error ? err : new Error(String(err)),
        { module: 'subscription', action: 'pre_renewal_notifications', userId: sub.userId },
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Job dispatcher
// ---------------------------------------------------------------------------

const JOB_HANDLERS: Record<CronJobType, () => Promise<void>> = {
  daily_expiry_check: handleDailyExpiryCheck,
  grace_period_check: handleGracePeriodCheck,
  reconciliation: handleReconciliation,
  monthly_quota_reset: handleMonthlyQuotaReset,
  pre_renewal_notifications: handlePreRenewalNotifications,
};

// ---------------------------------------------------------------------------
// Lazy-init worker singleton
// ---------------------------------------------------------------------------

let subscriptionCronWorker: Worker | null = null;

/**
 * Return (creating on first call) the BullMQ Worker that processes jobs from
 * the 'subscription-cron-queue'. Follows the lazy-init pattern established by
 * researchWorker.ts — the worker is only created when first requested, so
 * importing this module has no side effects.
 *
 * Worker config:
 *  - concurrency: 1  (cron jobs must not run concurrently)
 *  - connection: shared Redis connection
 */
export function getSubscriptionCronWorker(): Worker | null {
  if (subscriptionCronWorker) return subscriptionCronWorker;

  const connection = getSharedRedisConnection();
  if (!connection) {
    logger.warn('[subscription-cron] Redis unavailable — SubscriptionCronWorker cannot be initialized');
    return null;
  }

  logger.info('[subscription-cron] Lazy-initializing SubscriptionCronWorker...');

  subscriptionCronWorker = new Worker<SubscriptionCronJobData>(
    'subscription-cron-queue',
    async (job: Job<SubscriptionCronJobData>) => {
      const { type, triggeredAt } = job.data;

      logger.info(`[subscription-cron] Processing job type=${type} triggeredAt=${triggeredAt}`, {
        module: 'subscription',
        action: 'cron_job_start',
        jobType: type,
        jobId: job.id,
        triggeredAt,
      });

      const handler = JOB_HANDLERS[type];
      if (!handler) {
        logger.warn(`[subscription-cron] Unknown job type: ${type}`);
        return;
      }

      await handler();

      logger.info(`[subscription-cron] Completed job type=${type}`, {
        module: 'subscription',
        action: 'cron_job_complete',
        jobType: type,
        jobId: job.id,
      });
    },
    {
      concurrency: 1,
      connection,
    },
  );

  subscriptionCronWorker.on('failed', (job, err) => {
    logger.error(
      `[subscription-cron] Job failed: id=${job?.id} type=${job?.data?.type}`,
      err,
      { module: 'subscription', action: 'cron_job_failed', jobId: job?.id, jobType: job?.data?.type },
    );
  });

  return subscriptionCronWorker;
}
