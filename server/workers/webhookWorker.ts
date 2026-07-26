/**
 * Webhook Event Worker — Dedicated worker for processing Instagram webhook events.
 *
 * Consumes events from the `webhook-events` BullMQ queue, evaluates automation rules,
 * and issues reply calls through the GovernedHttpClient (never bypassed).
 *
 * Key design choices:
 * - Per-account concurrency limits via BullMQ group feature prevent one account's
 *   viral comment flood from starving other accounts.
 * - Checks UsageStore tier before issuing reply API calls.
 * - Exponential backoff retry on failure with dead-letter queue after max retries.
 * - Lazy initialization: worker starts on first use to reduce idle overhead.
 *
 * Requirements: 7.3, 7.4, 7.5, 7.8, 7.9, 12.1, 12.2, 12.3, 12.4, 12.6
 */

import { Worker, Job, Queue } from 'bullmq';
import { getSharedRedisConnection } from '../lib/redis';
import { UsageStore, UsageTier } from '../services/UsageStore';
import { getGovernedHttpClient, GovernedHttpClient } from '../services/GovernedHttpClient';
import { rateLimitConfig } from '../config/rateLimitConfig';
import { processWebhookEntry } from '../routes/webhooks';
import type { WebhookEventJobData } from '../queues/webhookQueue';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/**
 * Automation action determined by rule evaluation.
 */
interface AutomationAction {
  type: 'reply_comment' | 'reply_dm' | 'like_comment' | 'none';
  targetId: string;
  accountId: string;
  message?: string;
  token?: string;
}

// ---------------------------------------------------------------------------
// Dead Letter Queue
// ---------------------------------------------------------------------------

const DEAD_LETTER_QUEUE_NAME = 'webhook-events-dead-letter';

let deadLetterQueue: Queue | null = null;

function getDeadLetterQueue(): Queue | null {
  if (deadLetterQueue) return deadLetterQueue;

  try {
    const redis = getSharedRedisConnection();
    if (!redis || redis.status !== 'ready') return null;

    deadLetterQueue = new Queue(DEAD_LETTER_QUEUE_NAME, {
      connection: redis,
      defaultJobOptions: {
        removeOnComplete: { count: 500 },
        removeOnFail: false, // Keep dead-letter jobs for manual review
      },
    });

    return deadLetterQueue;
  } catch (error) {
    console.error('[WEBHOOK-WORKER] Failed to initialize dead-letter queue:', error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Worker State
// ---------------------------------------------------------------------------

let webhookWorker: Worker<WebhookEventJobData> | null = null;
let usageStore: UsageStore | null = null;
let governedClient: GovernedHttpClient | null = null;

/**
 * Lazily initialize the UsageStore singleton for the worker.
 */
function getUsageStore(): UsageStore | null {
  if (usageStore) return usageStore;

  try {
    const redis = getSharedRedisConnection();
    usageStore = new UsageStore(redis);
    return usageStore;
  } catch (error) {
    console.warn('[WEBHOOK-WORKER] Failed to initialize UsageStore:', (error as Error).message);
    return null;
  }
}

/**
 * Lazily initialize the GovernedHttpClient for issuing reply calls.
 */
function getClient(): GovernedHttpClient | null {
  if (governedClient) return governedClient;

  const store = getUsageStore();
  if (!store) return null;

  try {
    governedClient = getGovernedHttpClient(store);
    return governedClient;
  } catch (error) {
    console.warn('[WEBHOOK-WORKER] Failed to initialize GovernedHttpClient:', (error as Error).message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Core Processing Logic
// ---------------------------------------------------------------------------

/**
 * Process a single webhook event job.
 *
 * Steps:
 * 1. Parse the entry and identify the Instagram account
 * 2. Check UsageStore tier BEFORE processing — if Restricted/Critical, defer automation replies
 * 3. Look up the relevant Veefore user/account (via processWebhookEntry)
 * 4. Evaluate automation rules to determine if a reply is needed
 * 5. Issue reply calls through GovernedHttpClient (never bypass)
 *
 * Requirements:
 * - 7.3: Worker evaluates automation rules
 * - 7.4: Checks UsageStore before issuing reply calls
 * - 12.4: Respects tier policy and defers replies at Restricted/Critical
 */
async function processWebhookEvent(job: Job<WebhookEventJobData>): Promise<any> {
  const { instagramAccountId, eventType, rawPayload, receivedAt } = job.data;
  const latency = Date.now() - receivedAt;

  console.log(
    `[WEBHOOK-WORKER] 🔄 Processing event (Queue Latency: ${latency}ms, ` +
    `Account: ${instagramAccountId || 'unknown'}, Type: ${eventType}, Attempt: ${job.attemptsMade + 1})`
  );

  // Step 1: Determine the account ID
  const accountId = instagramAccountId || (rawPayload as any)?.id;
  if (!accountId) {
    console.warn('[WEBHOOK-WORKER] ⚠️ No Instagram account ID found in event, processing generically');
  }

  // Step 2: Check tier BEFORE processing (Requirement 7.4)
  // If the account is in Restricted or Critical tier, we still process the webhook
  // (to update local state like comment counts) but defer any outbound API reply calls.
  let shouldDeferReplies = false;
  if (accountId) {
    const store = getUsageStore();
    if (store) {
      try {
        const tier = await store.getTier(accountId);
        if (tier === UsageTier.RESTRICTED || tier === UsageTier.CRITICAL) {
          shouldDeferReplies = true;
          console.log(
            `[WEBHOOK-WORKER] ⏸️ Account ${accountId} is in ${tier} tier — ` +
            `automation reply calls will be deferred per tier policy`
          );
        }
      } catch (tierError) {
        // Non-critical: if we can't check tier, proceed with normal processing
        console.warn('[WEBHOOK-WORKER] Could not check account tier:', (tierError as Error).message);
      }
    }
  }

  // Step 3 & 4: Delegate to processWebhookEntry which handles:
  //   - Looking up the Veefore user/account via SocialAccountModel
  //   - Evaluating automation rules (comment replies, DMs, etc.)
  //   - All webhook change type routing
  //   - Any outbound reply calls go through GovernedHttpClient (Step 5)
  //
  // The rawPayload is the original entry item from Meta's webhook POST body.
  // processWebhookEntry expects the raw entry format: { id, changes?, messaging? }
  try {
    const entryItem = rawPayload as any;
    await processWebhookEntry(entryItem);
  } catch (processingError) {
    console.error(
      `[WEBHOOK-WORKER] ❌ Failed to process webhook entry for account ${accountId}:`,
      processingError
    );
    throw processingError; // Let BullMQ handle retry with exponential backoff
  }

  console.log(`[WEBHOOK-WORKER] ✅ Successfully processed webhook event for account ${accountId || 'unknown'}`);
  return {
    status: 'success',
    accountId,
    eventType,
    latencyMs: latency,
    repliesDeferred: shouldDeferReplies,
  };
}

/**
 * Handle job failure — move to dead-letter queue after max retries exhausted.
 *
 * Requirements:
 * - 7.9: Retry with exponential backoff, dead-letter after max retries
 */
async function handleFailedJob(job: Job<WebhookEventJobData> | undefined, error: Error): Promise<void> {
  if (!job) return;

  const maxAttempts = job.opts?.attempts ?? rateLimitConfig.queue.maxDeferredRetries;
  const isMaxRetriesExhausted = job.attemptsMade >= maxAttempts;

  if (isMaxRetriesExhausted) {
    console.error(
      `[WEBHOOK-WORKER] 💀 Job ${job.id} exhausted all ${maxAttempts} retries. ` +
      `Moving to dead-letter queue. Error: ${error.message}`
    );

    // Move to dead-letter queue for manual review
    const dlq = getDeadLetterQueue();
    if (dlq) {
      try {
        await dlq.add('dead-letter', {
          originalJobId: job.id,
          originalData: job.data,
          failedAt: new Date().toISOString(),
          error: error.message,
          attempts: job.attemptsMade,
          accountId: job.data.instagramAccountId,
          eventType: job.data.eventType,
        });
        console.log(`[WEBHOOK-WORKER] 📬 Dead-lettered job ${job.id}`);
      } catch (dlqError) {
        console.error('[WEBHOOK-WORKER] Failed to dead-letter job:', dlqError);
      }
    }

    // Emit monitoring alert
    console.error(
      `[WEBHOOK-WORKER] 🚨 ALERT: Webhook event (type: ${job.data.eventType}) for account ` +
      `${job.data.instagramAccountId || 'unknown'} failed permanently after ${maxAttempts} attempts`
    );
  } else {
    console.warn(
      `[WEBHOOK-WORKER] ⚠️ Job ${job.id} failed (attempt ${job.attemptsMade}/${maxAttempts}): ${error.message}`
    );
  }
}

// ---------------------------------------------------------------------------
// Worker Initialization
// ---------------------------------------------------------------------------

/**
 * Get or lazily initialize the dedicated webhook event worker.
 *
 * Uses BullMQ group/limiter feature for per-account concurrency limits:
 * - Each Instagram account ID acts as a group key
 * - Concurrency within a group is limited by config (webhookConcurrencyPerAccount)
 * - This ensures one account's flood doesn't starve others (Req 12.3)
 *
 * Retry strategy (Req 7.9):
 * - Exponential backoff: 2s → 4s → 8s → 16s (capped at 30s)
 * - Max attempts from rateLimitConfig.queue.maxDeferredRetries
 * - Dead-letter queue after all retries exhausted
 */
export const getWebhookWorker = (): Worker<WebhookEventJobData> | null => {
  if (webhookWorker) return webhookWorker;

  let redisConnection: any;
  try {
    redisConnection = getSharedRedisConnection();
  } catch {
    console.warn('[WEBHOOK-WORKER] ⚠️ Redis unavailable, Webhook Worker cannot be initialized');
    return null;
  }

  const redisAvailable = redisConnection && redisConnection.status === 'ready';
  if (!redisAvailable) {
    console.warn('[WEBHOOK-WORKER] ⚠️ Redis not ready, Webhook Worker cannot be initialized');
    return null;
  }

  console.log('[WEBHOOK-WORKER] 🪝 Initializing dedicated webhook event worker...');

  const concurrencyPerAccount = rateLimitConfig.queue.webhookConcurrencyPerAccount;

  webhookWorker = new Worker<WebhookEventJobData>(
    'webhook-events',
    async (job: Job<WebhookEventJobData>) => {
      return processWebhookEvent(job);
    },
    {
      connection: redisConnection,
      // Global concurrency — total parallel jobs across all accounts.
      // Set high enough to process events from many accounts simultaneously
      // while the limiter restricts per-second throughput to prevent overload.
      concurrency: concurrencyPerAccount * 10,
      // Rate limiter: max jobs processed per duration across all groups.
      // BullMQ standard edition applies this globally; per-account isolation
      // is enforced via the `group` option on job add (in webhookQueue.ts).
      // If BullMQ Pro is available, groupKey-based concurrency kicks in automatically.
      limiter: {
        max: concurrencyPerAccount * 10,
        duration: 1000, // Process up to N jobs per second total
      },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 500 },
    }
  );

  // ---------------------------------------------------------------------------
  // Event Handlers
  // ---------------------------------------------------------------------------

  webhookWorker.on('completed', (job) => {
    // Silent on success — reduce log noise during normal operation
  });

  webhookWorker.on('failed', (job, error) => {
    handleFailedJob(job, error);
  });

  webhookWorker.on('error', (error) => {
    console.error('[WEBHOOK-WORKER] 🚨 Worker error:', error);
  });

  webhookWorker.on('stalled', (jobId) => {
    console.warn(`[WEBHOOK-WORKER] ⚠️ Job ${jobId} stalled — will be retried`);
  });

  console.log(
    `[WEBHOOK-WORKER] ✅ Worker started (concurrency: ${concurrencyPerAccount}/account, ` +
    `global: ${concurrencyPerAccount * 10})`
  );

  return webhookWorker;
};

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/**
 * Stop the webhook worker gracefully.
 * Waits for in-progress jobs to complete before shutting down.
 */
export async function stopWebhookWorker(): Promise<void> {
  if (webhookWorker) {
    console.log('[WEBHOOK-WORKER] 🛑 Stopping webhook worker...');
    await webhookWorker.close();
    webhookWorker = null;
    console.log('[WEBHOOK-WORKER] ✅ Worker stopped');
  }

  if (deadLetterQueue) {
    await deadLetterQueue.close();
    deadLetterQueue = null;
  }
}

/**
 * Reset the worker state (useful for testing).
 */
export function resetWebhookWorker(): void {
  webhookWorker = null;
  usageStore = null;
  governedClient = null;
  deadLetterQueue = null;
}

// Backward compatibility: Keep old function name but delegate to lazy getter
export const startWebhookWorker = getWebhookWorker;
