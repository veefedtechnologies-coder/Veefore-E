import { Queue, QueueOptions } from 'bullmq';
import { getSharedRedisConnection } from '../lib/redis';

export interface AIJobData {
  type: 'competitor_analysis' | 'bulk_repurpose' | 'social_listening';
  userId: string;
  workspaceId?: string;
  payload: any;
}

// Use shared Redis connection (Task 3: Connection Pooling)
const redisConnection = getSharedRedisConnection();
const redisAvailable = redisConnection && redisConnection.status === 'ready';

const queueOptions: QueueOptions = redisConnection ? {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
  },
} : {} as any;

export const aiQueue = redisConnection ? new Queue<AIJobData>('ai-processing', queueOptions) : null;

export class AIQueueManager {
  static async addJob(type: AIJobData['type'], userId: string, payload: any, workspaceId?: string): Promise<string | null> {
    if (!redisAvailable || !aiQueue) return null;
    
    // Task 5.7: Trigger lazy worker initialization on first job
    const { getAIWorker } = await import('../workers/aiWorker');
    const worker = getAIWorker();
    if (!worker) {
      console.warn('⚠️ AI Worker could not be initialized');
      return null;
    }
    
    try {
      const job = await aiQueue.add(type, { type, userId, workspaceId, payload }, {
        jobId: `ai-${type}-${userId}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        priority: 2,
      });
      return job.id || null;
    } catch (error) {
      console.error(`🚨 Failed to queue AI job:`, error);
      return null;
    }
  }
}

