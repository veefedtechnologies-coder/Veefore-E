import { Queue, QueueOptions } from 'bullmq';
import { getSharedRedisConnection } from '../lib/redis';

/**
 * Insights queue — offloads the heavy MongoDB aggregation + AI generation for
 * the Performance Banner and Growth Recommendations to a BullMQ worker, so HTTP
 * requests read the finished result from Redis instead of querying MongoDB on
 * every page load.
 */
export interface InsightsJobData {
  kind: 'banner' | 'recommendations';
  workspaceId: string;
  userId: string;
  preferences: any;
  // Banner-only:
  period?: 'day' | 'week' | 'month';
  clientMetrics?: any;
}

const redisConnection = getSharedRedisConnection();
const redisAvailable = redisConnection && redisConnection.status === 'ready';

const queueOptions: QueueOptions = redisConnection ? {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: 50,
    removeOnFail: 25,
    // IMPORTANT: a single attempt only. Insights jobs call paid/quota-limited
    // AI APIs — retrying on failure (e.g. a 429) would multiply AI calls and
    // can exhaust the daily quota. Failures are handled via a cooldown marker
    // so the route stops re-enqueuing instead of retrying.
    attempts: 1,
  },
} : {} as any;

export const insightsQueue = redisConnection ? new Queue<InsightsJobData>('insights-generation', queueOptions) : null;

export function isInsightsQueueAvailable(): boolean {
  return !!insightsQueue && !!redisConnection && redisConnection.status === 'ready';
}

// Redis key helpers for the cached results and in-flight de-duplication locks.
export const insightsCacheKey = (kind: string, workspaceId: string, period?: string): string =>
  `veefore:insights:${kind}:${workspaceId}${period ? `:${period}` : ''}`;

// Last successfully generated result survives normal cache invalidation/TTL so
// the UI can keep showing a known-good card after the automatic monthly cap.
export const insightsLastKnownKey = (kind: string, workspaceId: string, period?: string): string =>
  `veefore:insights:last-known:${kind}:${workspaceId}${period ? `:${period}` : ''}`;

export const insightsLockKey = (kind: string, workspaceId: string, period?: string): string =>
  `veefore:insights:lock:${kind}:${workspaceId}${period ? `:${period}` : ''}`;

// After a failed generation we set a cooldown marker so the polling client and
// future requests stop re-enqueuing (which would multiply AI calls and can
// exhaust quota). Cleared automatically by TTL or on a successful generation.
export const insightsCooldownKey = (kind: string, workspaceId: string, period?: string): string =>
  `veefore:insights:cooldown:${kind}:${workspaceId}${period ? `:${period}` : ''}`;

export class InsightsQueueManager {
  /**
   * Enqueue an insights-generation job, de-duplicating concurrent requests for
   * the same (kind, workspace, period) within a short window.
   *
   * @returns true if a job was enqueued (or already in-flight), false if the
   *          queue/Redis is unavailable and the caller must run inline.
   */
  static async enqueue(data: InsightsJobData): Promise<boolean> {
    if (!insightsQueue) return false;

    // Lazily start the worker on first use.
    try {
      const { getInsightsWorker } = await import('../workers/insightsWorker');
      const worker = getInsightsWorker();
      if (!worker) return false;
    } catch (e) {
      console.warn('[InsightsQueueManager] Failed to init worker:', (e as Error).message);
      return false;
    }

    const dedupeWindow = Math.floor(Date.now() / 15000); // 15s window
    const jobId = `insights-${data.kind}-${data.workspaceId}-${data.period || 'na'}-${dedupeWindow}`;

    try {
      await insightsQueue.add(data.kind, data, { jobId, priority: 5 });
      return true;
    } catch (error) {
      console.error('[InsightsQueueManager] Failed to enqueue insights job:', (error as Error).message);
      return false;
    }
  }
}
