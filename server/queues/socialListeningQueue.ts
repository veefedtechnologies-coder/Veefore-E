import { Queue, QueueOptions } from 'bullmq';
import { redisConnection, redisAvailable } from './metricsQueue';
import { getSocialListeningWorker } from '../workers/social-listening.worker';
import { getSocialListeningAIWorker } from '../workers/social-listening-ai.worker';

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
    // Task 5.7: Trigger lazy worker initialization on first job
    const worker = getSocialListeningWorker();
    if (!worker || !redisAvailable || !socialListeningIngestQueue) {
      console.log(`⚠️ Social Listening Worker or Redis unavailable, skipping ingestion for ${jobData.value}`);
      return false;
    }
    try {
      await socialListeningIngestQueue.add('ingest-source', jobData, {
        jobId: `ingest-${jobData.sourceId}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      });
      console.log(`👂 Scheduled social listening ingestion for ${jobData.platform}: ${jobData.value}`);
      return true;
    } catch (error) {
      console.error(`🚨 Failed to schedule listening ingestion:`, error);
      return false;
    }
  }

  static async scheduleAIAnalysis(jobData: AIAnalysisJobData): Promise<boolean> {
    // Task 5.7: Trigger lazy worker initialization on first job
    const worker = getSocialListeningAIWorker();
    if (!worker || !redisAvailable || !socialListeningAIQueue) {
      console.log(`⚠️ Social Listening AI Worker or Redis unavailable, skipping AI analysis for post ${jobData.postId}`);
      return false;
    }
    try {
      await socialListeningAIQueue.add('analyze-post', jobData, {
        jobId: `ai-${jobData.postId}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      });
      console.log(`🧠 Scheduled AI analysis for post ${jobData.postId}`);
      return true;
    } catch (error) {
      console.error(`🚨 Failed to schedule AI analysis:`, error);
      return false;
    }
  }
}
