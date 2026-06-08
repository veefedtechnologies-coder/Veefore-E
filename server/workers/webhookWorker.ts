import { Worker, Job } from 'bullmq';
import { getSharedRedisConnection } from '../lib/redis';
import { WebhookJobData } from '../queues/webhookQueue';
import { processWebhookEntry } from '../routes/webhooks';

// Lazy initialization: Worker only starts when first webhook is queued (Task 5.5)
let webhookWorker: Worker | null = null;

/**
 * Get Webhook Worker - Lazy initialization pattern
 * Worker only starts when first webhook is queued to eliminate idle overhead
 * 
 * NOTE: Consider if webhook processing should remain synchronous (direct processing)
 * or use queue (async). Current implementation uses queue for scalability.
 * 
 * @returns Worker instance or null if Redis unavailable
 */
export const getWebhookWorker = (): Worker | null => {
  if (!webhookWorker) {
    const redisConnection = getSharedRedisConnection();
    const redisAvailable = redisConnection && redisConnection.status === 'ready';

    if (!redisAvailable) {
      console.warn('⚠️ Redis unavailable, Webhook Worker cannot be initialized');
      return null;
    }

    console.log('🪝 Lazy-initializing Webhook Worker on first use...');

    webhookWorker = new Worker<WebhookJobData>(
      'webhook-ingestion',
      async (job: Job<WebhookJobData>) => {
        const { entryItem, receivedAt } = job.data;
        const latency = Date.now() - new Date(receivedAt).getTime();
        
        console.log(`[WEBHOOK WORKER] 🔄 Processing webhook entry (Queue Latency: ${latency}ms)`);
        
        try {
          await processWebhookEntry(entryItem);
          console.log(`[WEBHOOK WORKER] ✅ Successfully processed webhook entry`);
        } catch (error) {
          console.error(`[WEBHOOK WORKER] ❌ Failed to process webhook entry:`, error);
          throw error; // Let BullMQ handle retries
        }
      },
      {
        connection: redisConnection as any,
        concurrency: 50, // High concurrency for realtime webhooks
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 500 },
      }
    );

    webhookWorker.on('completed', (job) => {
      // console.log(`[WEBHOOK WORKER] Job ${job.id} completed`);
    });

    webhookWorker.on('failed', (job, err) => {
      console.error(`[WEBHOOK WORKER] 🚨 Job ${job?.id} failed after ${job?.attemptsMade} attempts:`, err);
    });
  }

  return webhookWorker;
};

// Backward compatibility: Keep old function name but delegate to lazy getter
export const startWebhookWorker = getWebhookWorker;
