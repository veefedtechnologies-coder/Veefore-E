/**
 * Backfill Queue Worker — Dedicated worker for processing background post backfill jobs.
 *
 * Processes backfill jobs ONLY during Normal tier, defers during Caution and above.
 * Uses TieredJobScheduler.dispatchOrDefer() for each backfill job to ensure backfill
 * never starves user-facing or automation work.
 *
 * Key design choices:
 * - Checks account tier BEFORE processing each job (via TieredJobScheduler.canDispatch)
 * - Defers jobs via TieredJobScheduler.dispatchOrDefer() when not in Normal tier
 * - Low priority by design — backfill is the first job type deferred under load
 * - Lazy initialization: worker starts on first use to reduce idle overhead
 * - Follows the same BullMQ Worker pattern as webhookWorker.ts
 *
 * Requirements: 6.4, 6.5, 4.2
 */

import { Worker, Job } from 'bullmq';
import { getSharedRedisConnection } from '../lib/redis';
import { logger } from '../config/logger';
import { rateLimitConfig } from '../config/rateLimitConfig';
import { getUsageStoreInstance, UsageStore } from '../services/UsageStore';
import { getGovernedHttpClient, GovernedHttpClient, GovernedRequestOptions } from '../services/GovernedHttpClient';
import { TieredJobScheduler, JobType, ScheduledJob } from '../services/TieredJobScheduler';
import type { BackfillJobData } from '../services/BackfillService';
import { CURRENT_CONTENT_INSIGHT_EXPANSION } from '../services/insightMetricSelection';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BACKFILL_QUEUE_NAME = 'backfill-jobs';
const FACEBOOK_GRAPH_API_BASE = 'https://graph.facebook.com';

// ---------------------------------------------------------------------------
// Worker State
// ---------------------------------------------------------------------------

let backfillWorker: Worker<BackfillJobData> | null = null;
let usageStore: UsageStore | null = null;
let governedClient: GovernedHttpClient | null = null;
let scheduler: TieredJobScheduler | null = null;

/**
 * Lazily initialize the UsageStore singleton for the worker.
 */
function getUsageStore(): UsageStore | null {
  if (usageStore) return usageStore;

  try {
    usageStore = getUsageStoreInstance();
    return usageStore;
  } catch (error) {
    logger.warn('[BACKFILL-WORKER] Failed to initialize UsageStore', {
      component: 'BackfillWorker',
      error: (error as Error).message,
    });
    return null;
  }
}

/**
 * Lazily initialize the GovernedHttpClient for making API calls.
 */
function getClient(): GovernedHttpClient | null {
  if (governedClient) return governedClient;

  const store = getUsageStore();
  if (!store) return null;

  try {
    governedClient = getGovernedHttpClient(store);
    return governedClient;
  } catch (error) {
    logger.warn('[BACKFILL-WORKER] Failed to initialize GovernedHttpClient', {
      component: 'BackfillWorker',
      error: (error as Error).message,
    });
    return null;
  }
}

/**
 * Lazily initialize the TieredJobScheduler for tier-aware gating.
 */
function getScheduler(): TieredJobScheduler | null {
  if (scheduler) return scheduler;

  const store = getUsageStore();
  if (!store) return null;

  try {
    scheduler = new TieredJobScheduler(store, rateLimitConfig);
    return scheduler;
  } catch (error) {
    logger.warn('[BACKFILL-WORKER] Failed to initialize TieredJobScheduler', {
      component: 'BackfillWorker',
      error: (error as Error).message,
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Core Processing Logic
// ---------------------------------------------------------------------------

/**
 * Process a single backfill job.
 *
 * Steps:
 * 1. Check account tier via TieredJobScheduler BEFORE processing
 * 2. If not Normal tier, defer the job via dispatchOrDefer() — backfill only runs at Normal
 * 3. If Normal tier, fetch the next page of older posts via GovernedHttpClient
 * 4. Enqueue any further pages into the backfill queue for continued processing
 *
 * Requirements:
 * - 6.4: Backfill queue processes older posts at low priority
 * - 6.5: Backfill only runs during Normal tier, deferred during Caution and above
 * - 4.2: Caution tier defers backfill and non-urgent analytics refresh
 */
async function processBackfillJob(job: Job<BackfillJobData>): Promise<any> {
  const { accountId, accessToken, workspaceId, pagingCursor, priority, createdAt } = job.data;

  logger.info('[BACKFILL-WORKER] Processing backfill job', {
    component: 'BackfillWorker',
    accountId,
    jobId: job.id,
    attempt: job.attemptsMade + 1,
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Step 1: Check tier BEFORE processing (Requirement 6.5, 4.2)
  // Backfill jobs only run during Normal tier. If the account is in Caution
  // or above, the job is deferred via TieredJobScheduler.dispatchOrDefer().
  // ─────────────────────────────────────────────────────────────────────────
  const jobScheduler = getScheduler();
  if (!jobScheduler) {
    // Cannot check tier — fail the job so BullMQ retries later
    throw new Error('TieredJobScheduler not available — cannot verify account tier');
  }

  const scheduledJob: ScheduledJob = {
    id: job.id || `backfill-${accountId}-${Date.now()}`,
    accountId,
    type: JobType.BACKFILL,
    payload: job.data,
    priority,
    scheduledAt: createdAt,
    retryCount: job.attemptsMade,
    maxRetries: rateLimitConfig.queue.maxDeferredRetries,
  };

  const result = await jobScheduler.dispatchOrDefer(scheduledJob);

  if (result === 'deferred') {
    logger.info('[BACKFILL-WORKER] Job deferred — account not in Normal tier', {
      component: 'BackfillWorker',
      accountId,
      jobId: job.id,
    });
    // Return successfully so BullMQ doesn't retry this specific job instance.
    // The TieredJobScheduler has re-queued it in the deferred queue for later.
    return {
      status: 'deferred',
      accountId,
      reason: 'Account not in Normal tier — backfill deferred per tier policy',
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 2: Job is permitted (Normal tier) — fetch the next page of older posts
  // ─────────────────────────────────────────────────────────────────────────
  const client = getClient();
  if (!client) {
    throw new Error('GovernedHttpClient not available — cannot fetch backfill data');
  }

  logger.info('[BACKFILL-WORKER] Fetching older posts page', {
    component: 'BackfillWorker',
    accountId,
    cursor: pagingCursor.substring(0, 50) + '...',
  });

  // The pagingCursor is a full URL from Meta's paging response.
  // We need to extract the path and params to use with GovernedHttpClient.
  let fetchPath: string;
  let fetchParams: Record<string, string> = {};

  try {
    const cursorUrl = new URL(pagingCursor);
    fetchPath = cursorUrl.pathname;
    cursorUrl.searchParams.forEach((value, key) => {
      fetchParams[key] = value;
    });
  } catch {
    // If pagingCursor isn't a full URL, use it as a raw path (unlikely but safe)
    fetchPath = pagingCursor;
  }

  // Add field-expansion for insights on older posts. Current-content polling
  // requests `views` (not the deprecated `impressions`) and bundles
  // `saved`/`shares` in the same request (smart-polling-system Req 2.2, 3.1).
  if (!fetchParams['fields']) {
    fetchParams['fields'] = `id,caption,media_type,timestamp,like_count,comments_count,${CURRENT_CONTENT_INSIGHT_EXPANSION}{data}`;
  }

  const requestOptions: GovernedRequestOptions = {
    method: 'GET',
    path: fetchPath,
    token: accessToken,
    params: fetchParams,
    accountId,
    priority: 'low',
  };

  const response = await client.request<{
    data: any[];
    paging?: { next?: string; cursors?: { after?: string } };
  }>(requestOptions);

  const postsRetrieved = response.data?.data?.length || 0;

  logger.info('[BACKFILL-WORKER] Fetched older posts page', {
    component: 'BackfillWorker',
    accountId,
    postsRetrieved,
    hasNextPage: !!response.data?.paging?.next,
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Step 3: If there's a next page, enqueue another backfill job
  // This allows incremental backfill across multiple worker cycles, each
  // respecting the tier check at the start.
  // ─────────────────────────────────────────────────────────────────────────
  if (response.data?.paging?.next) {
    const { BackfillService } = await import('../services/BackfillService');
    await BackfillService.enqueueOlderPosts(
      accountId,
      accessToken,
      workspaceId,
      response.data.paging.next
    );

    logger.info('[BACKFILL-WORKER] Enqueued next backfill page', {
      component: 'BackfillWorker',
      accountId,
    });
  }

  return {
    status: 'completed',
    accountId,
    postsRetrieved,
    hasMorePages: !!response.data?.paging?.next,
  };
}

// ---------------------------------------------------------------------------
// Worker Initialization
// ---------------------------------------------------------------------------

/**
 * Get or lazily initialize the dedicated backfill worker.
 *
 * Follows the same BullMQ Worker pattern as webhookWorker.ts:
 * - Low concurrency to ensure backfill never starves user-facing work
 * - Exponential backoff retry on failure
 * - Rate limiter to prevent overwhelming the API during backfill
 *
 * Requirements:
 * - 6.5: Backfill respects tier policy, only runs during Normal tier
 * - 4.2: Backfill deferred during Caution and above
 */
export const getBackfillWorker = (): Worker<BackfillJobData> | null => {
  if (backfillWorker) return backfillWorker;

  let redisConnection: any;
  try {
    redisConnection = getSharedRedisConnection();
  } catch {
    logger.warn('[BACKFILL-WORKER] Redis unavailable, Backfill Worker cannot be initialized', {
      component: 'BackfillWorker',
    });
    return null;
  }

  const redisAvailable = redisConnection && redisConnection.status === 'ready';
  if (!redisAvailable) {
    logger.warn('[BACKFILL-WORKER] Redis not ready, Backfill Worker cannot be initialized', {
      component: 'BackfillWorker',
    });
    return null;
  }

  logger.info('[BACKFILL-WORKER] Initializing dedicated backfill worker...', {
    component: 'BackfillWorker',
  });

  backfillWorker = new Worker<BackfillJobData>(
    BACKFILL_QUEUE_NAME,
    async (job: Job<BackfillJobData>) => {
      return processBackfillJob(job);
    },
    {
      connection: redisConnection,
      // Low concurrency — backfill is low priority and should never starve
      // user-facing or automation work (Requirement 6.5)
      concurrency: 2,
      // Rate limiter: process at most 2 backfill jobs per 5 seconds.
      // Keeps backfill from consuming too much API budget.
      limiter: {
        max: 2,
        duration: 5000,
      },
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 100 },
    }
  );

  // ---------------------------------------------------------------------------
  // Event Handlers
  // ---------------------------------------------------------------------------

  backfillWorker.on('completed', (job) => {
    if (job?.returnvalue?.status === 'deferred') {
      logger.info('[BACKFILL-WORKER] Job deferred to retry queue', {
        component: 'BackfillWorker',
        accountId: job.data.accountId,
        jobId: job.id,
      });
    }
  });

  backfillWorker.on('failed', (job, error) => {
    const attempts = job?.attemptsMade ?? 0;
    const maxAttempts = job?.opts?.attempts ?? rateLimitConfig.queue.maxDeferredRetries;

    if (attempts >= maxAttempts) {
      logger.error('[BACKFILL-WORKER] Job exhausted all retries', {
        component: 'BackfillWorker',
        alert: 'BACKFILL_JOB_FAILED_PERMANENTLY',
        accountId: job?.data?.accountId,
        jobId: job?.id,
        attempts,
        error: error.message,
      });
    } else {
      logger.warn('[BACKFILL-WORKER] Job failed, will retry', {
        component: 'BackfillWorker',
        accountId: job?.data?.accountId,
        jobId: job?.id,
        attempt: attempts,
        maxAttempts,
        error: error.message,
      });
    }
  });

  backfillWorker.on('error', (error) => {
    logger.error('[BACKFILL-WORKER] Worker error', {
      component: 'BackfillWorker',
      error: error.message,
    });
  });

  backfillWorker.on('stalled', (jobId) => {
    logger.warn('[BACKFILL-WORKER] Job stalled — will be retried', {
      component: 'BackfillWorker',
      jobId,
    });
  });

  logger.info('[BACKFILL-WORKER] Worker started (concurrency: 2, rate: 2/5s)', {
    component: 'BackfillWorker',
  });

  return backfillWorker;
};

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/**
 * Stop the backfill worker gracefully.
 * Waits for in-progress jobs to complete before shutting down.
 */
export async function stopBackfillWorker(): Promise<void> {
  if (backfillWorker) {
    logger.info('[BACKFILL-WORKER] Stopping backfill worker...', {
      component: 'BackfillWorker',
    });
    await backfillWorker.close();
    backfillWorker = null;
    logger.info('[BACKFILL-WORKER] Worker stopped', {
      component: 'BackfillWorker',
    });
  }
}

/**
 * Reset the worker state (useful for testing).
 */
export function resetBackfillWorker(): void {
  backfillWorker = null;
  usageStore = null;
  governedClient = null;
  scheduler = null;
}

// Backward compatibility alias
export const startBackfillWorker = getBackfillWorker;
