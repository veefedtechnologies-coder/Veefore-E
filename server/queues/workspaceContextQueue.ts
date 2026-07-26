import { Queue, QueueOptions } from 'bullmq';
import { getSharedRedisConnection } from '../lib/redis';

/**
 * Workspace-context queue — offloads building the consolidated VeeGPT context
 * snapshot (user + workspace + social accounts + content + recommendations +
 * AI banner) to a BullMQ worker, so the chat path NEVER queries MongoDB. The
 * worker reads Mongo once per refresh and writes the result to Redis.
 *
 * Refresh is triggered:
 *   - lazily, when chat needs context and the cache is missing/stale
 *   - on demand, when underlying data changes (account sync, profile update…)
 */
export interface WorkspaceContextJobData {
  workspaceId: string;
  userId: string;
  reason?: string;
}

const redisConnection = getSharedRedisConnection();

const queueOptions: QueueOptions = redisConnection
  ? {
      connection: redisConnection,
      defaultJobOptions: {
        removeOnComplete: 50,
        removeOnFail: 25,
        attempts: 2,
        backoff: { type: 'exponential', delay: 2000 },
      },
    }
  : ({} as any);

export const workspaceContextQueue = redisConnection
  ? new Queue<WorkspaceContextJobData>('workspace-context', queueOptions)
  : null;

export function isWorkspaceContextQueueAvailable(): boolean {
  return !!workspaceContextQueue && !!redisConnection && redisConnection.status === 'ready';
}

/** Short-lived lock to de-duplicate concurrent refreshes for a workspace. */
export const workspaceContextLockKey = (workspaceId: string): string =>
  `veefore:wsctx:lock:${workspaceId}`;

/** How long a stored snapshot is considered fresh before a refresh is enqueued. */
export const WORKSPACE_CONTEXT_TTL_SECONDS = 6 * 60 * 60; // 6h safety net

export class WorkspaceContextQueueManager {
  /**
   * Enqueue a context refresh, de-duplicating concurrent requests for the same
   * workspace within a short window. Returns true if a job was enqueued (or one
   * was already in-flight), false if the queue/Redis is unavailable.
   */
  static async enqueue(data: WorkspaceContextJobData): Promise<boolean> {
    if (!workspaceContextQueue) return false;
    try {
      const { getWorkspaceContextWorker } = await import('../workers/workspaceContextWorker');
      if (!getWorkspaceContextWorker()) return false;
    } catch (e) {
      console.warn('[WorkspaceContextQueueManager] Failed to init worker:', (e as Error).message);
      return false;
    }

    const dedupeWindow = Math.floor(Date.now() / 15000); // 15s window
    const jobId = `wsctx-${data.workspaceId}-${dedupeWindow}`;
    try {
      await workspaceContextQueue.add('refresh', data, { jobId, priority: 6 });
      return true;
    } catch (error) {
      console.error('[WorkspaceContextQueueManager] enqueue failed:', (error as Error).message);
      return false;
    }
  }
}
