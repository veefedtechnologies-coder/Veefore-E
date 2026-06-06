import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';

// Import all queues
import {
  metricsQueue,
  webhookQueue as metricsWebhookQueue,
  tokenRefreshQueue
} from '../queues/metricsQueue';

import { webhookQueue } from '../queues/webhookQueue';
import { aiQueue } from '../queues/aiQueue';
import { notificationQueue } from '../queues/notificationQueue';
import { automationQueue } from '../queues/automationQueue';
import { postQueue } from '../queues/postQueue';
import { messageQueue } from '../queues/messageQueue';
import {
  socialListeningIngestQueue,
  socialListeningAIQueue
} from '../queues/socialListeningQueue';

import { getEmailQueue } from './queue';

// Initialize the Express adapter
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/queues-dashboard');

// Collect all initialized queues
const queues = [
  metricsQueue,
  metricsWebhookQueue,
  tokenRefreshQueue,
  webhookQueue,
  aiQueue,
  notificationQueue,
  automationQueue,
  postQueue,
  messageQueue,
  socialListeningIngestQueue,
  socialListeningAIQueue,
  getEmailQueue()
].filter(Boolean); // Filter out nulls if Redis is unavailable

if (queues.length > 0) {
  createBullBoard({
    queues: queues.map((q) => new BullMQAdapter(q as any)),
    serverAdapter: serverAdapter,
  });
  console.log(`📊 Bull Board initialized with ${queues.length} queues.`);
} else {
  console.log(`⚠️ Bull Board skipped: No queues initialized (Redis likely unavailable).`);
}

export { serverAdapter };
