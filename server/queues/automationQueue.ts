import { Queue, QueueOptions } from 'bullmq';
import { redisConnection, redisAvailable } from './metricsQueue';

// Interface for Comment-to-DM Automation Jobs
export interface AutomationJobData {
  workspaceId: string;
  instagramAccountId: string;
  commentId: string;
  mediaId: string;
  commentText: string;
  username: string;
  userId?: string;
  fullName?: string;
  receivedAt: Date;
}

// Queue options (using the shared redis connection)
const queueOptions: QueueOptions = redisConnection ? {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: 500, // Keep last 500 completed jobs for analytics
    removeOnFail: 100,     // Keep last 100 failed jobs
    attempts: 3,           // Retry up to 3 times on failure
    backoff: {
      type: 'exponential',
      delay: 3000,         // Wait 3s, then 9s, then 27s
    },
  },
} : {} as any;

// Create the dedicated automation queue
export const automationQueue = redisConnection ? new Queue<AutomationJobData>('automation-processing', queueOptions) : null;

export class AutomationQueueManager {
  /**
   * Schedule a new comment for automation processing
   */
  static async scheduleCommentProcessing(jobData: AutomationJobData): Promise<boolean> {
    if (!redisAvailable || !automationQueue) {
      console.log(`⚠️ Redis unavailable, skipping automation processing for comment ${jobData.commentId}`);
      // Fallback: Could process synchronously here, but for scale we just drop or log
      return false;
    }

    try {
      await automationQueue.add('process-comment', jobData, {
        jobId: `automation-${jobData.workspaceId}-${jobData.commentId}`,
        priority: 1, // High priority
      });
      
      console.log(`🤖 Scheduled automation processing for comment from @${jobData.username}`);
      return true;
    } catch (error) {
      console.error(`🚨 Failed to schedule automation processing:`, error);
      return false;
    }
  }

  /**
   * Get queue statistics
   */
  static async getQueueStats() {
    if (!redisAvailable || !automationQueue) {
      return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, available: false };
    }

    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        automationQueue.getWaitingCount(),
        automationQueue.getActiveCount(),
        automationQueue.getCompletedCount(),
        automationQueue.getFailedCount(),
        automationQueue.getDelayedCount(),
      ]);

      return {
        waiting,
        active,
        completed,
        failed,
        delayed,
        available: true,
      };
    } catch (error) {
      console.error(`🚨 Failed to get automation queue stats:`, error);
      return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, available: false };
    }
  }
}

// Error handling
if (automationQueue) {
  automationQueue.on('error', (err) => {
    console.error('🚨 Automation Queue Error:', err);
  });
}
