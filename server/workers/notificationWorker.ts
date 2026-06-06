import { Worker, Job } from 'bullmq';
import { redisConnection, redisAvailable } from '../queues/metricsQueue';
import { NotificationJobData } from '../queues/notificationQueue';
import RealtimeService from '../services/realtime';

let notificationWorker: Worker | null = null;

export const startNotificationWorker = () => {
  if (!redisAvailable) {
    console.warn('⚠️ Redis unavailable, skipping Notification Worker initialization');
    return null;
  }

  console.log('📣 Starting Notification Broadcast Worker...');

  notificationWorker = new Worker<NotificationJobData>(
    'notifications',
    async (job: Job<NotificationJobData>) => {
      const data = job.data;
      
      console.log(`[NOTIFICATION WORKER] 📡 Broadcasting ${data.type} to workspace ${data.workspaceId}`);
      
      try {
        RealtimeService.broadcastToWorkspace(data.workspaceId, 'app_notification', {
          type: data.type,
          title: data.title,
          message: data.message,
          link: data.link,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error(`[NOTIFICATION WORKER] ❌ Failed to broadcast:`, error);
        throw error;
      }
    },
    {
      connection: redisConnection as any,
      concurrency: 10,
    }
  );

  return notificationWorker;
};
