import { Queue } from 'bullmq';
import { redisConnection, isRedisAvailable } from './metricsQueue';

// Re-export for convenience
export { isRedisAvailable };

export interface ScheduledPostJobData {
  contentId: number;
  workspaceId: string;
  scheduledAt: Date;
  platform: string;
  title?: string;
  retryCount?: number;
}

export const postQueue = redisConnection ? new Queue<ScheduledPostJobData>('post-scheduler', {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 60000,
    },
  },
}) : null;

export class PostSchedulerManager {
  static async schedulePost(
    contentId: number,
    scheduledAt: Date,
    workspaceId: string,
    options: {
      platform?: string;
      title?: string;
    } = {}
  ): Promise<{ success: boolean; jobId?: string; error?: string }> {
    if (!isRedisAvailable() || !postQueue) {
      console.log(`[POST_QUEUE] Redis unavailable, cannot schedule post ${contentId} via queue`);
      return { success: false, error: 'Redis unavailable' };
    }

    try {
      const now = new Date();
      const delay = Math.max(0, scheduledAt.getTime() - now.getTime());
      
      const jobData: ScheduledPostJobData = {
        contentId,
        workspaceId,
        scheduledAt,
        platform: options.platform || 'instagram',
        title: options.title,
        retryCount: 0,
      };

      const job = await postQueue.add('publish-post', jobData, {
        delay,
        jobId: `post-${contentId}-${Date.now()}`,
        removeOnComplete: true,
        removeOnFail: false,
      });

      console.log(`[POST_QUEUE] Scheduled post ${contentId} for ${scheduledAt.toISOString()} (delay: ${delay}ms, jobId: ${job.id})`);
      return { success: true, jobId: job.id };
    } catch (error: any) {
      console.error(`[POST_QUEUE] Failed to schedule post ${contentId}:`, error);
      return { success: false, error: error.message };
    }
  }

  static async cancelScheduledPost(contentId: number): Promise<{ success: boolean; error?: string }> {
    if (!isRedisAvailable() || !postQueue) {
      console.log(`[POST_QUEUE] Redis unavailable, cannot cancel post ${contentId}`);
      return { success: false, error: 'Redis unavailable' };
    }

    try {
      const jobs = await postQueue.getJobs(['waiting', 'delayed', 'active']);
      let cancelled = false;

      for (const job of jobs) {
        if (job.data.contentId === contentId) {
          await job.remove();
          cancelled = true;
          console.log(`[POST_QUEUE] Cancelled scheduled post ${contentId} (jobId: ${job.id})`);
        }
      }

      if (!cancelled) {
        console.log(`[POST_QUEUE] No scheduled job found for post ${contentId}`);
      }

      return { success: true };
    } catch (error: any) {
      console.error(`[POST_QUEUE] Failed to cancel post ${contentId}:`, error);
      return { success: false, error: error.message };
    }
  }

  static async reschedulePost(
    contentId: number,
    newScheduledAt: Date,
    workspaceId?: string
  ): Promise<{ success: boolean; jobId?: string; error?: string }> {
    if (!isRedisAvailable() || !postQueue) {
      console.log(`[POST_QUEUE] Redis unavailable, cannot reschedule post ${contentId}`);
      return { success: false, error: 'Redis unavailable' };
    }

    try {
      const jobs = await postQueue.getJobs(['waiting', 'delayed', 'active']);
      let existingJob = null;

      for (const job of jobs) {
        if (job.data.contentId === contentId) {
          existingJob = job;
          break;
        }
      }

      if (existingJob) {
        const jobData = existingJob.data;
        await existingJob.remove();
        
        return this.schedulePost(contentId, newScheduledAt, workspaceId || jobData.workspaceId, {
          platform: jobData.platform,
          title: jobData.title,
        });
      } else {
        if (!workspaceId) {
          return { success: false, error: 'No existing job found and workspaceId not provided' };
        }
        return this.schedulePost(contentId, newScheduledAt, workspaceId);
      }
    } catch (error: any) {
      console.error(`[POST_QUEUE] Failed to reschedule post ${contentId}:`, error);
      return { success: false, error: error.message };
    }
  }

  static async getScheduledPosts(workspaceId?: string): Promise<ScheduledPostJobData[]> {
    if (!isRedisAvailable() || !postQueue) {
      return [];
    }

    try {
      const jobs = await postQueue.getJobs(['waiting', 'delayed']);
      const posts = jobs.map(job => job.data);

      if (workspaceId) {
        return posts.filter(post => post.workspaceId === workspaceId);
      }

      return posts;
    } catch (error: any) {
      console.error(`[POST_QUEUE] Failed to get scheduled posts:`, error);
      return [];
    }
  }

  static async getQueueStats() {
    if (!isRedisAvailable() || !postQueue) {
      return {
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
        redisAvailable: false,
      };
    }

    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        postQueue.getWaiting(),
        postQueue.getActive(),
        postQueue.getCompleted(),
        postQueue.getFailed(),
        postQueue.getDelayed(),
      ]);

      return {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        delayed: delayed.length,
        redisAvailable: true,
      };
    } catch (error: any) {
      console.error(`[POST_QUEUE] Failed to get queue stats:`, error);
      return {
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
        redisAvailable: false,
        error: error.message,
      };
    }
  }
}
