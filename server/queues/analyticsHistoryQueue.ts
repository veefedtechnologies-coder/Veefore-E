import { Queue, QueueOptions } from 'bullmq';
import { getSharedRedisConnection } from '../lib/redis';
import { backfillJobId } from '../features/analytics/history/windowKeys';

/**
 * Analytics history queue — offloads the expensive, rate-limited Meta Graph API
 * fetch of `follows_and_unfollows` (up to ~27 chunked requests per window) to a
 * BullMQ worker. The HTTP request path only READS the durable MongoDB store /
 * Redis; the worker is the only writer, so continuously re-querying the
 * dashboard never hits Meta or hammers Mongo — it just re-reads the cache.
 *
 * Historical windows (ending before today) are immutable, so once a worker has
 * stored a window it is never fetched again.
 */
export interface AnalyticsHistoryJobData {
  kind: 'follows_and_unfollows' | 'insights' | 'facebook_insights';
  workspaceId: string;
  accountId: string;
  /** Access token for the account (used by the worker to call Meta). */
  token: string;
  /** Window bounds as ISO strings. */
  fromIso: string;
  toIso: string;
}

const redisConnection = getSharedRedisConnection();

const queueOptions: QueueOptions = redisConnection
  ? {
      connection: redisConnection,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        // A couple of retries with backoff — Meta calls can transiently fail
        // (rate limits), and re-fetching historical data is idempotent (upsert).
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    }
  : ({} as QueueOptions);

export const analyticsHistoryQueue = redisConnection
  ? new Queue<AnalyticsHistoryJobData>('analytics-history-backfill', queueOptions)
  : null;

export function isAnalyticsHistoryQueueAvailable(): boolean {
  return !!analyticsHistoryQueue && !!redisConnection && redisConnection.status === 'ready';
}

export class AnalyticsHistoryQueueManager {
  /**
   * Enqueue a backfill, de-duplicated per (kind, account, window) via a
   * deterministic jobId. Lazily starts the worker on first use.
   *
   * @param delay Optional BullMQ delay in milliseconds (for phased backfill).
   * @returns true if enqueued (or already in-flight), false if the queue/Redis
   *          is unavailable (the caller may then fetch inline as a fallback).
   */
  private static async enqueue(data: AnalyticsHistoryJobData, delay?: number): Promise<boolean> {
    const { histLog } = await import('../features/analytics/history/historyDebugLog');
    if (!analyticsHistoryQueue) {
      histLog('QUEUE_UNAVAILABLE', {
        kind: data.kind,
        accountId: data.accountId,
        reason: 'Redis/BullMQ not configured — caller will fall back to inline fetch',
      });
      return false;
    }

    try {
      const { getAnalyticsHistoryWorker } = await import('../workers/analyticsHistoryWorker');
      if (!getAnalyticsHistoryWorker()) {
        histLog('QUEUE_WORKER_UNAVAILABLE', { kind: data.kind, accountId: data.accountId });
        return false;
      }
    } catch (e) {
      histLog('QUEUE_WORKER_INIT_ERROR', { kind: data.kind, accountId: data.accountId, error: (e as Error).message });
      console.warn('[AnalyticsHistoryQueue] Failed to init worker:', (e as Error).message);
      return false;
    }

    const fromYmd = data.fromIso.slice(0, 10);
    const toYmd = data.toIso.slice(0, 10);
    const group = data.kind === 'insights' ? 'insights' : 'follows';
    const jobId = backfillJobId(group, data.accountId, fromYmd, toYmd);

    try {
      await analyticsHistoryQueue.add(data.kind, data, {
        jobId,
        priority: 5,
        ...(delay && delay > 0 ? { delay } : {}),
      });
      histLog('QUEUE_ENQUEUED', {
        kind: data.kind,
        jobId,
        accountId: data.accountId,
        fromYmd,
        toYmd,
        delayMs: delay || 0,
        note: delay ? `phased backfill — starts in ${Math.round(delay / 60000)}m` : 'deduped per (kind, account, window) — a same-day repeat collapses to one job',
      });
      return true;
    } catch (error) {
      histLog('QUEUE_ENQUEUE_ERROR', { kind: data.kind, accountId: data.accountId, error: (error as Error).message });
      console.error('[AnalyticsHistoryQueue] Failed to enqueue:', (error as Error).message);
      return false;
    }
  }

  /** Enqueue a follows-and-unfollows backfill. */
  static enqueueFollows(data: AnalyticsHistoryJobData, delay?: number): Promise<boolean> {
    return this.enqueue(data, delay);
  }

  /** Enqueue an insights (reach/engagement/impressions/…) backfill. */
  static enqueueInsights(data: AnalyticsHistoryJobData, delay?: number): Promise<boolean> {
    return this.enqueue(data, delay);
  }
}
