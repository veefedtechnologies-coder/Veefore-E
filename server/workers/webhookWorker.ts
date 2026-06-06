import { Worker, Job } from 'bullmq';
import { redisConnection, redisAvailable } from '../queues/metricsQueue';
import { WebhookJobData } from '../queues/webhookQueue';
import { processWebhookEntry } from '../routes/webhooks';

let webhookWorker: Worker | null = null;

export const startWebhookWorker = () => {
  if (!redisAvailable) {
    console.warn('⚠️ Redis unavailable, skipping Webhook Worker initialization');
    return null;
  }

  console.log('👷 Starting Webhook Ingestion Worker...');

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

  return webhookWorker;
};
