/**
 * Webhook Event Queue — Durable BullMQ queue for Instagram webhook processing.
 *
 * Separates webhook reception from processing (Requirement 7.8):
 * - Receiver validates signature, enqueues, returns HTTP 200 immediately
 * - Worker consumes from this queue asynchronously
 *
 * Features:
 * - BullMQ with Redis persistence (durable — events survive worker restarts)
 * - Per-account concurrency limits to prevent one account monopolizing workers
 * - Queue depth monitoring with configurable alert threshold
 *
 * Requirements: 7.5, 7.8, 12.5, 12.6, 12.7
 */

import { Queue, QueueOptions } from 'bullmq';
import { getSharedRedisConnection } from '../lib/redis';
import { rateLimitConfig } from '../config/rateLimitConfig';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Data structure for webhook event jobs in the queue.
 * Each entry represents a single webhook event from Meta.
 */
export interface WebhookEventJobData {
  /** The Instagram account ID this event belongs to */
  instagramAccountId: string;
  /** Type of webhook event */
  eventType: 'comment' | 'mention' | 'story_insights' | 'message' | 'media_update' | 'unknown';
  /** Raw payload from Meta's webhook POST body (single entry item) */
  rawPayload: unknown;
  /** Timestamp when the webhook was received by our server */
  receivedAt: number;
}

// Backward compatibility — re-export old interface name for existing consumers
export interface WebhookJobData {
  entryItem: any;
  receivedAt: Date;
}

// ---------------------------------------------------------------------------
// Redis Connection
// ---------------------------------------------------------------------------

let redisConnection: ReturnType<typeof getSharedRedisConnection> | null = null;
let redisAvailable = false;

try {
  if (!process.env.REDIS_URL) {
    console.log('[WebhookQueue] ℹ️  No REDIS_URL configured, webhook queue disabled');
    redisConnection = null;
  } else {
    redisConnection = getSharedRedisConnection();

    redisConnection.on('ready', () => {
      redisAvailable = true;
    });

    redisConnection.on('error', () => {
      redisAvailable = false;
    });

    redisConnection.on('close', () => {
      redisAvailable = false;
    });

    // Check if already connected
    if (redisConnection.status === 'ready') {
      redisAvailable = true;
    }
  }
} catch (error) {
  console.error('[WebhookQueue] ❌ Failed to get Redis connection:', (error as Error).message);
  redisConnection = null;
  redisAvailable = false;
}

// ---------------------------------------------------------------------------
// Queue Configuration
// ---------------------------------------------------------------------------

const QUEUE_NAME = 'webhook-events';

const queueOptions: QueueOptions | null = redisConnection
  ? {
      connection: redisConnection,
      defaultJobOptions: {
        removeOnComplete: 1000,
        removeOnFail: 500,
        attempts: rateLimitConfig.maxRetries,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    }
  : null;

// ---------------------------------------------------------------------------
// Queue Instance
// ---------------------------------------------------------------------------

/**
 * The durable webhook-events BullMQ queue.
 * Null if Redis is unavailable (graceful degradation).
 */
export const webhookEventsQueue: Queue<WebhookEventJobData> | null =
  redisConnection && queueOptions
    ? new Queue<WebhookEventJobData>(QUEUE_NAME, queueOptions)
    : null;

// Backward compatibility — keep old export name working
export const webhookQueue = webhookEventsQueue;

// ---------------------------------------------------------------------------
// Queue Depth Monitoring
// ---------------------------------------------------------------------------

/** Interval handle for periodic queue depth checks */
let depthMonitorInterval: ReturnType<typeof setInterval> | null = null;

/** Track whether alert has already been emitted to avoid spamming */
let alertEmitted = false;

/**
 * Checks current queue depth and emits a monitoring alert if it exceeds
 * the configured threshold (Requirement 12.7).
 *
 * The threshold is loaded from `rateLimitConfig.queue.queueDepthAlertThreshold`.
 */
export async function checkQueueDepth(): Promise<{
  depth: number;
  threshold: number;
  alertTriggered: boolean;
}> {
  if (!webhookEventsQueue || !redisAvailable) {
    return { depth: 0, threshold: rateLimitConfig.queue.queueDepthAlertThreshold, alertTriggered: false };
  }

  try {
    const waitingCount = await webhookEventsQueue.getWaitingCount();
    const delayedCount = await webhookEventsQueue.getDelayedCount();
    const depth = waitingCount + delayedCount;
    const threshold = rateLimitConfig.queue.queueDepthAlertThreshold;

    if (depth > threshold) {
      if (!alertEmitted) {
        alertEmitted = true;
        console.error(
          `[WebhookQueue] 🚨 ALERT: Queue depth ${depth} exceeds threshold ${threshold}. ` +
          `Webhook processing may be falling behind. Consider scaling workers.`
        );
        // Emit structured monitoring alert
        emitMonitoringAlert('queue_depth_exceeded', {
          queueName: QUEUE_NAME,
          currentDepth: depth,
          threshold,
          waitingCount,
          delayedCount,
          timestamp: Date.now(),
        });
      }
      return { depth, threshold, alertTriggered: true };
    }

    // Reset alert flag once depth falls below threshold
    if (alertEmitted && depth <= threshold) {
      alertEmitted = false;
      console.log(
        `[WebhookQueue] ✅ Queue depth ${depth} back below threshold ${threshold}. Alert cleared.`
      );
    }

    return { depth, threshold, alertTriggered: false };
  } catch (error) {
    console.error('[WebhookQueue] Failed to check queue depth:', (error as Error).message);
    return { depth: 0, threshold: rateLimitConfig.queue.queueDepthAlertThreshold, alertTriggered: false };
  }
}

/**
 * Emit a structured monitoring alert.
 * This can be extended to push to external monitoring (DataDog, PagerDuty, etc.).
 */
function emitMonitoringAlert(alertType: string, metadata: Record<string, unknown>): void {
  console.warn(JSON.stringify({
    level: 'alert',
    alertType,
    component: 'WebhookQueue',
    ...metadata,
  }));
}

/**
 * Start periodic queue depth monitoring.
 * Checks every 30 seconds by default.
 */
export function startQueueDepthMonitoring(intervalMs: number = 30_000): void {
  if (depthMonitorInterval) {
    clearInterval(depthMonitorInterval);
  }

  if (!webhookEventsQueue) {
    console.log('[WebhookQueue] Queue depth monitoring skipped — queue not available');
    return;
  }

  depthMonitorInterval = setInterval(() => {
    checkQueueDepth().catch((err) => {
      console.error('[WebhookQueue] Depth monitor error:', err);
    });
  }, intervalMs);

  console.log(`[WebhookQueue] 📊 Queue depth monitoring started (every ${intervalMs / 1000}s, threshold: ${rateLimitConfig.queue.queueDepthAlertThreshold})`);
}

/**
 * Stop periodic queue depth monitoring.
 */
export function stopQueueDepthMonitoring(): void {
  if (depthMonitorInterval) {
    clearInterval(depthMonitorInterval);
    depthMonitorInterval = null;
    console.log('[WebhookQueue] Queue depth monitoring stopped');
  }
}

// ---------------------------------------------------------------------------
// Per-Account Concurrency Configuration
// ---------------------------------------------------------------------------

/**
 * Per-account concurrency limit for webhook processing.
 * Loaded from centralized config (Requirement 12.6).
 *
 * This value is used by the webhook worker when setting up BullMQ group concurrency
 * to ensure one account's flood doesn't starve workers for other accounts.
 */
export const WEBHOOK_CONCURRENCY_PER_ACCOUNT: number =
  rateLimitConfig.queue.webhookConcurrencyPerAccount;

/**
 * Total worker concurrency — allows processing across multiple accounts simultaneously
 * while each individual account is limited by WEBHOOK_CONCURRENCY_PER_ACCOUNT.
 */
export const WEBHOOK_TOTAL_CONCURRENCY: number =
  WEBHOOK_CONCURRENCY_PER_ACCOUNT * 20; // Support up to ~20 concurrent accounts

// ---------------------------------------------------------------------------
// Queue Manager
// ---------------------------------------------------------------------------

export class WebhookQueueManager {
  /**
   * Enqueue a webhook event for asynchronous processing.
   * Called by the webhook receiver route after signature validation.
   *
   * The instagramAccountId in the job data is used by the worker to enforce
   * per-account concurrency limits (Requirement 12.6). The worker tracks active
   * jobs per account and skips processing when the limit is reached, re-queuing
   * with a short delay.
   */
  static async enqueue(eventData: WebhookEventJobData): Promise<boolean> {
    if (!webhookEventsQueue || !redisAvailable) {
      console.warn('[WebhookQueue] ⚠️ Queue unavailable, webhook event cannot be enqueued');
      return false;
    }

    try {
      await webhookEventsQueue.add('process-webhook-event', eventData, {
        priority: 1, // High priority for realtime webhook processing
        jobId: `wh-${eventData.instagramAccountId}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      });

      return true;
    } catch (error) {
      console.error('[WebhookQueue] 🚨 Failed to enqueue webhook event:', (error as Error).message);
      return false;
    }
  }

  /**
   * Backward-compatible method for existing code that uses addWebhookEvent.
   * Wraps raw entry items into the new WebhookEventJobData format.
   */
  static async addWebhookEvent(entryItem: any): Promise<boolean> {
    const eventData: WebhookEventJobData = {
      instagramAccountId: entryItem?.id || 'unknown',
      eventType: detectEventType(entryItem),
      rawPayload: entryItem,
      receivedAt: Date.now(),
    };

    return WebhookQueueManager.enqueue(eventData);
  }

  /**
   * Get queue statistics for monitoring (Requirement 12.5).
   */
  static async getStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    if (!webhookEventsQueue || !redisAvailable) {
      return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
    }

    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        webhookEventsQueue.getWaitingCount(),
        webhookEventsQueue.getActiveCount(),
        webhookEventsQueue.getCompletedCount(),
        webhookEventsQueue.getFailedCount(),
        webhookEventsQueue.getDelayedCount(),
      ]);

      return { waiting, active, completed, failed, delayed };
    } catch (error) {
      console.error('[WebhookQueue] Failed to get stats:', (error as Error).message);
      return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Detect the event type from a raw webhook entry item.
 */
function detectEventType(entryItem: any): WebhookEventJobData['eventType'] {
  if (!entryItem) return 'unknown';

  if (entryItem.changes) {
    const fields = entryItem.changes.map((c: any) => c.field);
    if (fields.includes('comments')) return 'comment';
    if (fields.includes('mentions') || fields.includes('story_mentions')) return 'mention';
    if (fields.includes('story_insights')) return 'story_insights';
    if (fields.includes('messages') || fields.includes('messaging')) return 'message';
    if (fields.includes('media') || fields.includes('feed')) return 'media_update';
  }

  if (entryItem.messaging) return 'message';

  return 'unknown';
}

// ---------------------------------------------------------------------------
// Error Handling
// ---------------------------------------------------------------------------

if (webhookEventsQueue) {
  webhookEventsQueue.on('error', (err) => {
    console.error('[WebhookQueue] 🚨 Queue Error:', err.message);
  });
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export { QUEUE_NAME as WEBHOOK_QUEUE_NAME, redisAvailable as isWebhookQueueAvailable };
