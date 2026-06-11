import { Queue, QueueOptions } from 'bullmq';
import { redisConnection, redisAvailable } from './metricsQueue';
import { getNotificationWorker } from '../workers/notificationWorker';

export interface NotificationJobData {
  userId: string;
  workspaceId: string;
  type: 'alert' | 'success' | 'info' | 'error';
  title: string;
  message: string;
  link?: string;
}

const queueOptions: QueueOptions = redisConnection ? {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: 1000,
    removeOnFail: 500,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
  },
} : {} as any;

export const notificationQueue = redisConnection ? new Queue<NotificationJobData>('notifications', queueOptions) : null;

export class NotificationQueueManager {
  static async sendNotification(data: NotificationJobData): Promise<boolean> {
    if (!redisAvailable || !notificationQueue) return false;
    
    // Task 5.7: Trigger lazy worker initialization on first job
    const worker = getNotificationWorker();
    if (!worker) {
      console.warn('⚠️ Notification Worker unavailable, cannot queue notification');
      return false;
    }
    
    try {
      await notificationQueue.add('send-notification', data, {
        jobId: `notif-${data.userId}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        priority: 3, // Lower priority than webhooks
      });
      console.log('📢 Scheduled notification job');
      return true;
    } catch (error) {
      console.error(`🚨 Failed to queue notification:`, error);
      return false;
    }
  }
}
