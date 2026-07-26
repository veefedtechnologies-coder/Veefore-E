import { Queue } from 'bullmq';
import { getSharedRedisConnection } from '../lib/redis';

/**
 * Subscription cron queue — schedules periodic lifecycle maintenance jobs:
 * expiry checks, grace-period enforcement, quota resets, reconciliation with
 * Cashfree, and pre-renewal notifications.
 *
 * Follows the same Redis-connection pattern as researchQueue.ts.
 * The worker lives in server/workers/subscriptionCronWorker.ts.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CronJobType =
  | 'daily_expiry_check'
  | 'grace_period_check'
  | 'reconciliation'
  | 'monthly_quota_reset'
  | 'pre_renewal_notifications';

export interface SubscriptionCronJobData {
  type: CronJobType;
  triggeredAt: string;
}

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

const redisConnection = getSharedRedisConnection();

export const subscriptionCronQueue = redisConnection
  ? new Queue<SubscriptionCronJobData>('subscription-cron-queue', {
      connection: redisConnection,
      defaultJobOptions: {
        removeOnComplete: 50,
        removeOnFail: 25,
        attempts: 1,
      },
    })
  : null;

export function isSubscriptionCronQueueAvailable(): boolean {
  return !!subscriptionCronQueue && !!redisConnection && redisConnection.status === 'ready';
}
