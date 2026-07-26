import { Queue, QueueOptions } from 'bullmq';
import { getSharedRedisConnection } from '../lib/redis';

/**
 * Research refresh queue — offloads periodic re-research of trends / niche
 * insights to a BullMQ worker so the freshest data is precomputed and cached
 * (and persisted to Mongo) without blocking any request. Mirrors the insights
 * queue conventions (single attempt, dedupe window, lazy worker start).
 */
export interface ResearchJobData {
  kind: 'trends' | 'competitors' | 'niche-insights';
  workspaceId: string;
  userId: string;
  query: string;
  preferences?: any;
}

const redisConnection = getSharedRedisConnection();

const queueOptions: QueueOptions = redisConnection ? {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: 50,
    removeOnFail: 25,
    // Single attempt — research calls paid AI + external search APIs; retries
    // would multiply cost. Failures simply leave the previous cached result.
    attempts: 1,
  },
} : {} as any;

export const researchQueue = redisConnection ? new Queue<ResearchJobData>('research-refresh', queueOptions) : null;

export function isResearchQueueAvailable(): boolean {
  return !!researchQueue && !!redisConnection && redisConnection.status === 'ready';
}

export class ResearchQueueManager {
  /**
   * Enqueue a research-refresh job, de-duplicating concurrent requests for the
   * same (kind, workspace, query) within a short window.
   * @returns true if enqueued, false if the queue/Redis is unavailable.
   */
  static async enqueue(data: ResearchJobData): Promise<boolean> {
    if (!researchQueue) return false;
    try {
      const { getResearchWorker } = await import('../workers/researchWorker');
      const worker = getResearchWorker();
      if (!worker) return false;
    } catch (e) {
      console.warn('[ResearchQueueManager] Failed to init worker:', (e as Error).message);
      return false;
    }

    const dedupeWindow = Math.floor(Date.now() / 60000); // 60s window
    const safeQuery = (data.query || '').toLowerCase().replace(/\s+/g, '_').slice(0, 60);
    const jobId = `research-${data.kind}-${data.workspaceId}-${safeQuery}-${dedupeWindow}`;
    try {
      await researchQueue.add(data.kind, data, { jobId, priority: 8 });
      return true;
    } catch (error) {
      console.error('[ResearchQueueManager] Failed to enqueue research job:', (error as Error).message);
      return false;
    }
  }
}
