import { Queue, QueueOptions } from 'bullmq';
import { redisConnection, redisAvailable } from './metricsQueue';

export interface SocialListeningJobData {
  workspaceId: string;
  sourceId: string;
  platform: string;
  type: string;
  value: string;
  niche: string;
}

export interface AIAnalysisJobData {
  workspaceId: string;
  postId: string;
  platform: string;
  content: string;
  niche: string;
}

const queueOptions: QueueOptions = redisConnection ? {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: 1000,
    removeOnFail: 500,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
  },
} : {} as any;

export const socialListeningIngestQueue = redisConnection ? new Queue<SocialListeningJobData>('social-listening-ingest', queueOptions) : null;
export const socialListeningAIQueue = redisConnection ? new Queue<AIAnalysisJobData>('social-listening-ai', queueOptions) : null;

export class SocialListeningQueueManager {
  static async scheduleIngestion(jobData: SocialListeningJobData): Promise<boolean> {
    if (!redisAvailable || !socialListeningIngestQueue) {
      console.log(`⚠️ Redis unavailable, skipping listening ingestion for ${jobData.value}`);
      return false;
    }
    try {
      await socialListeningIngestQueue.add('ingest-source', jobData, {
        jobId: `ingest-${jobData.sourceId}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      });
      return true;
    } catch (error) {
      console.error(`🚨 Failed to schedule listening ingestion:`, error);
      return false;
    }
  }

  static async scheduleAIAnalysis(jobData: AIAnalysisJobData): Promise<boolean> {
    if (!redisAvailable || !socialListeningAIQueue) {
      console.log(`⚠️ Redis unavailable, skipping AI analysis for post ${jobData.postId}`);
      return false;
    }
    try {
      await socialListeningAIQueue.add('analyze-post', jobData, {
        jobId: `ai-${jobData.postId}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      });
      return true;
    } catch (error) {
      console.error(`🚨 Failed to schedule AI analysis:`, error);
      return false;
    }
  }
}
