import { Queue, QueueOptions } from 'bullmq';
import { redisConnection, redisAvailable } from './metricsQueue';

export interface MessageJobData {
  workspaceId: string;
  instagramAccountId: string;
  messagingItems: any[];
  receivedAt: Date;
}

const queueOptions: QueueOptions = redisConnection ? {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: 500,
    removeOnFail: 100,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 3000,
    },
  },
} : {} as any;

export const messageQueue = redisConnection ? new Queue<MessageJobData>('message-processing', queueOptions) : null;

export class MessageQueueManager {
  static async scheduleMessageProcessing(jobData: MessageJobData): Promise<boolean> {
    if (!redisAvailable || !messageQueue) {
      console.log(`⚠️ Redis unavailable, skipping message processing for workspace ${jobData.workspaceId}`);
      return false;
    }

    try {
      await messageQueue.add('process-message', jobData, {
        jobId: `message-${jobData.workspaceId}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        priority: 1,
      });
      
      console.log(`🤖 Scheduled message processing for workspace ${jobData.workspaceId}`);
      return true;
    } catch (error) {
      console.error(`🚨 Failed to schedule message processing:`, error);
      return false;
    }
  }

  static async getQueueStats() {
    if (!redisAvailable || !messageQueue) {
      return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, available: false };
    }

    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        messageQueue.getWaitingCount(),
        messageQueue.getActiveCount(),
        messageQueue.getCompletedCount(),
        messageQueue.getFailedCount(),
        messageQueue.getDelayedCount(),
      ]);

      return { waiting, active, completed, failed, delayed, available: true };
    } catch (error) {
      console.error(`🚨 Failed to get message queue stats:`, error);
      return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, available: false };
    }
  }
}

if (messageQueue) {
  messageQueue.on('error', (err) => {
    console.error('🚨 Message Queue Error:', err);
  });
}
