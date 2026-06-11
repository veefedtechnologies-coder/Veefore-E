import { Queue, QueueOptions } from 'bullmq';
import { redisConnection, redisAvailable } from './metricsQueue';
import { getWebhookWorker } from '../workers/webhookWorker';

export interface WebhookJobData {
  entryItem: any;
  receivedAt: Date;
}

const queueOptions: QueueOptions = redisConnection ? {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: 1000, 
    removeOnFail: 500,      
    attempts: 3,           
    backoff: {
      type: 'exponential',
      delay: 2000,         
    },
  },
} : {} as any;

export const webhookQueue = redisConnection ? new Queue<WebhookJobData>('webhook-ingestion', queueOptions) : null;

export class WebhookQueueManager {
  /**
   * Instantly ingest a raw webhook entry into the background worker queue
   * 
   * Task 5.7: Trigger lazy initialization of webhook worker before adding job
   */
  static async addWebhookEvent(entryItem: any): Promise<boolean> {
    // Ensure webhook worker is initialized (Task 5.5 - lazy initialization)
    const worker = getWebhookWorker();
    if (!worker || !redisAvailable || !webhookQueue) {
      console.warn(`⚠️ Webhook Worker or Redis unavailable, webhook queuing bypassed.`);
      return false;
    }

    try {
      await webhookQueue.add('process-webhook', {
        entryItem,
        receivedAt: new Date()
      }, {
        jobId: `webhook-event-${entryItem.id || 'sys'}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        priority: 1, // Extremely high priority for realtime ingestion
      });
      console.log('🪝 Scheduled webhook processing job');
      return true;
    } catch (error) {
      console.error(`🚨 Failed to queue webhook event:`, error);
      return false;
    }
  }
}

if (webhookQueue) {
  webhookQueue.on('error', (err) => {
    console.error('🚨 Webhook Ingestion Queue Error:', err);
  });
}

