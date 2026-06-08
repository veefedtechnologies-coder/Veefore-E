import { Worker, Job } from 'bullmq';
import { getSharedRedisConnection } from '../lib/redis';
import { NotificationJobData } from '../queues/notificationQueue';
import RealtimeService from '../services/realtime';

// Lazy initialization: Worker only starts when first notification is queued (Task 5.2)
let notificationWorker: Worker | null = null;

/**
 * Get Notification Worker - Lazy initialization pattern
 * Worker only starts when first notification is queued to eliminate idle overhead
 * @returns Worker instance or null if Redis unavailable
 */
export const getNotificationWorker = (): Worker | null => {
  if (!notificationWorker) {
    const redisConnection = getSharedRedisConnection();
    const redisAvailable = redisConnection && redisConnection.status === 'ready';

    if (!redisAvailable) {
      console.warn('⚠️ Redis unavailable, Notification Worker cannot be initialized');
      return null;
    }

    console.log('📢 Lazy-initializing Notification Worker on first use...');

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
  }

  return notificationWorker;
};

// Backward compatibility: Keep old function name but delegate to lazy getter
export const startNotificationWorker = getNotificationWorker;
