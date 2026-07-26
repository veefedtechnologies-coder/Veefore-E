/**
 * Facebook Token Refresh Job
 *
 * Runs every 6 hours via BullMQ repeatable job infrastructure.
 * Queries all Facebook SocialAccounts whose `tokenExpiresAt` is within 7 days
 * and proactively refreshes them using the fb_exchange_token grant.
 *
 * Failure handling:
 *   - Each failure increments `platformMetadata.tokenRefreshFailures` counter
 *   - After 3 consecutive failures the account is marked `connectionStatus = 'REQUIRES_RECONNECT'`
 *     so the Social Accounts page surfaces a reconnect notification to the user
 *   - Retry attempts for the same account are spaced 1 hour apart via the
 *     per-account `platformMetadata.nextRefreshAttemptAt` timestamp guard
 *
 * BullMQ repeatable cron:  "0 *\/6 * * *"  (every 6 hours)
 * One-off retry spacing:   1 hour between per-account attempts
 *
 * Requirements: 2.10, 2.11
 */

import { Queue, Worker, type Job } from 'bullmq';
import { getSharedRedisConnection } from '../lib/redis';
import { socialAccountRepository } from '../repositories/SocialAccountRepository';
import { FacebookProvider } from '../features/facebook/providers/FacebookProvider';
import { getAccessTokenFromAccount } from '../storage/converters';
import { logger } from '../config/logger';
import type { ISocialAccount, FacebookPlatformMetadata } from '../models/Social/SocialAccount';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** BullMQ queue name — must be unique across the application. */
const QUEUE_NAME = 'facebook-token-refresh';

/** Cron schedule: every 6 hours. */
const CRON_PATTERN = '0 */6 * * *';

/** Number of days ahead to look for expiring tokens. */
const EXPIRY_WINDOW_DAYS = 7;

/** Maximum number of consecutive refresh failures before marking REQUIRES_RECONNECT. */
const MAX_CONSECUTIVE_FAILURES = 3;

/** Minimum gap (ms) between retry attempts for a single account. */
const RETRY_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

// ---------------------------------------------------------------------------
// Job data shape
// ---------------------------------------------------------------------------

export interface FacebookTokenRefreshJobData {
  /** Identifies the specific trigger for logging. */
  triggeredAt: string;
}

// ---------------------------------------------------------------------------
// Lazy singleton provider
// ---------------------------------------------------------------------------

let _provider: FacebookProvider | null = null;
function getFacebookProvider(): FacebookProvider {
  if (!_provider) {
    _provider = new FacebookProvider();
  }
  return _provider;
}

// ---------------------------------------------------------------------------
// Core refresh logic (exported for direct use in tests and the route handler)
// ---------------------------------------------------------------------------

/**
 * Process a single account's token refresh attempt.
 *
 * Increments the failure counter on error. After MAX_CONSECUTIVE_FAILURES
 * consecutive failures the account transitions to REQUIRES_RECONNECT.
 */
export async function processAccountTokenRefresh(
  account: ISocialAccount
): Promise<{ success: boolean; skipped?: boolean }> {
  const accountId = (account._id as any).toString();
  const meta = (account.platformMetadata ?? {}) as FacebookPlatformMetadata & {
    tokenRefreshFailures?: number;
    nextRefreshAttemptAt?: string;
    lastRefreshError?: string;
  };

  // Enforce 1-hour gap between retry attempts for the same account
  if (meta.nextRefreshAttemptAt) {
    const nextAttempt = new Date(meta.nextRefreshAttemptAt).getTime();
    if (Date.now() < nextAttempt) {
      logger.info('[FacebookTokenRefresh] Skipping account — retry window not yet reached', {
        accountId,
        nextRefreshAttemptAt: meta.nextRefreshAttemptAt,
      });
      return { success: false, skipped: true };
    }
  }

  // Decrypt the stored access token
  const accessToken = getAccessTokenFromAccount(account);
  if (!accessToken) {
    logger.warn('[FacebookTokenRefresh] Account has no decryptable access token — skipping', {
      accountId,
    });
    return { success: false, skipped: true };
  }

  try {
    const provider = getFacebookProvider();
    const { accessToken: newAccessToken, expiresAt } = await provider.refreshToken(accessToken);

    // Persist new token and reset failure counters
    await socialAccountRepository.updateWithEncryptedTokens(accountId, {
      accessToken: newAccessToken,
      tokenExpiresAt: expiresAt,
      connectionStatus: 'ACTIVE',
      // Reset failure counters on success
      platformMetadata: {
        ...meta,
        tokenRefreshFailures: 0,
        nextRefreshAttemptAt: undefined,
        lastRefreshError: undefined,
      } as any,
    } as any);

    logger.info('[FacebookTokenRefresh] Token refreshed successfully', {
      accountId,
      newExpiresAt: expiresAt.toISOString(),
    });

    return { success: true };
  } catch (err) {
    const failures = (meta.tokenRefreshFailures ?? 0) + 1;
    const nextAttemptAt = new Date(Date.now() + RETRY_INTERVAL_MS).toISOString();
    const errorMessage = err instanceof Error ? err.message : String(err);

    logger.warn('[FacebookTokenRefresh] Token refresh failed', {
      accountId,
      failures,
      maxFailures: MAX_CONSECUTIVE_FAILURES,
      error: errorMessage,
    });

    if (failures >= MAX_CONSECUTIVE_FAILURES) {
      // Transition to REQUIRES_RECONNECT — polling will cease and user will be notified
      logger.error('[FacebookTokenRefresh] Max failures reached — marking REQUIRES_RECONNECT', {
        accountId,
        failures,
      });

      await socialAccountRepository.updateById(accountId, {
        connectionStatus: 'REQUIRES_RECONNECT',
        platformMetadata: {
          ...meta,
          tokenRefreshFailures: failures,
          lastRefreshError: errorMessage,
          nextRefreshAttemptAt: undefined, // No more auto-retries needed
        },
        updatedAt: new Date(),
      } as any);
    } else {
      // Schedule the next retry attempt 1 hour from now
      await socialAccountRepository.updateById(accountId, {
        platformMetadata: {
          ...meta,
          tokenRefreshFailures: failures,
          lastRefreshError: errorMessage,
          nextRefreshAttemptAt: nextAttemptAt,
        },
        updatedAt: new Date(),
      } as any);
    }

    return { success: false };
  }
}

/**
 * Main job processor.
 *
 * Finds all Facebook accounts expiring within EXPIRY_WINDOW_DAYS days
 * and attempts to refresh each token, processing failures per account
 * without letting one failure abort the entire run.
 */
export async function refreshExpiringFacebookTokens(): Promise<{
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
}> {
  const startTime = Date.now();

  logger.info('[FacebookTokenRefresh] Starting token refresh run', {
    windowDays: EXPIRY_WINDOW_DAYS,
  });

  let total = 0;
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  try {
    const expiringAccounts = await socialAccountRepository.findExpiringFacebook(EXPIRY_WINDOW_DAYS);
    total = expiringAccounts.length;

    logger.info('[FacebookTokenRefresh] Found expiring accounts', { count: total });

    for (const account of expiringAccounts) {
      try {
        const result = await processAccountTokenRefresh(account);
        if (result.skipped) {
          skipped++;
        } else if (result.success) {
          succeeded++;
        } else {
          failed++;
        }
      } catch (accountErr) {
        // Belt-and-suspenders: processAccountTokenRefresh should not throw, but we guard anyway
        failed++;
        logger.error('[FacebookTokenRefresh] Unexpected error processing account', accountErr, {
          accountId: (account._id as any).toString(),
        });
      }
    }
  } catch (err) {
    logger.error('[FacebookTokenRefresh] Fatal error during token refresh run', err);
    throw err;
  }

  const durationMs = Date.now() - startTime;
  logger.info('[FacebookTokenRefresh] Token refresh run completed', {
    total,
    succeeded,
    failed,
    skipped,
    durationMs,
  });

  return { total, succeeded, failed, skipped };
}

// ---------------------------------------------------------------------------
// BullMQ queue & worker setup
// ---------------------------------------------------------------------------

let _queue: Queue<FacebookTokenRefreshJobData> | null = null;
let _worker: Worker<FacebookTokenRefreshJobData> | null = null;

/**
 * Returns the BullMQ queue, creating it on first call.
 * Returns null if Redis is unavailable (graceful degradation).
 */
function getQueue(): Queue<FacebookTokenRefreshJobData> | null {
  if (_queue) return _queue;

  try {
    const connection = getSharedRedisConnection();
    _queue = new Queue<FacebookTokenRefreshJobData>(QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        removeOnComplete: 10,
        removeOnFail: 20,
        attempts: 1, // The job itself handles per-account retries internally
      },
    });
    return _queue;
  } catch (err) {
    logger.warn('[FacebookTokenRefresh] Could not create BullMQ queue (Redis unavailable)', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Register the Facebook token refresh job as a BullMQ repeatable job
 * and start the worker that processes it.
 *
 * Call this once during application startup (e.g., in server/index.ts).
 * Safe to call multiple times — idempotent guard prevents duplicate workers.
 */
export async function registerFacebookTokenRefreshJob(): Promise<void> {
  const queue = getQueue();
  if (!queue) {
    logger.warn(
      '[FacebookTokenRefresh] BullMQ queue unavailable — token refresh will not be scheduled automatically'
    );
    return;
  }

  // Remove stale repeatable jobs with the same name to avoid duplicates on restart
  try {
    const repeatableJobs = await queue.getRepeatableJobs();
    for (const job of repeatableJobs) {
      if (job.name === 'refresh-expiring-tokens') {
        await queue.removeRepeatableByKey(job.key);
        logger.info('[FacebookTokenRefresh] Removed stale repeatable job', { key: job.key });
      }
    }
  } catch (err) {
    // Non-fatal — proceed even if we can't clean stale jobs
    logger.warn('[FacebookTokenRefresh] Could not clean stale repeatable jobs', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Schedule the repeatable job (every 6 hours)
  await queue.add(
    'refresh-expiring-tokens',
    { triggeredAt: new Date().toISOString() },
    {
      repeat: { pattern: CRON_PATTERN },
    }
  );

  logger.info('[FacebookTokenRefresh] Repeatable job scheduled', { cron: CRON_PATTERN });

  // Start the worker if not already running
  if (_worker) return;

  try {
    const connection = getSharedRedisConnection();

    _worker = new Worker<FacebookTokenRefreshJobData>(
      QUEUE_NAME,
      async (_job: Job<FacebookTokenRefreshJobData>) => {
        await refreshExpiringFacebookTokens();
      },
      {
        connection,
        concurrency: 1, // One run at a time — prevents overlapping refresh cycles
      }
    );

    _worker.on('completed', (job) => {
      logger.info('[FacebookTokenRefresh] Worker job completed', { jobId: job.id });
    });

    _worker.on('failed', (job, err) => {
      logger.error('[FacebookTokenRefresh] Worker job failed', err, {
        jobId: job?.id,
      });
    });

    logger.info('[FacebookTokenRefresh] Worker started');
  } catch (err) {
    logger.error('[FacebookTokenRefresh] Failed to start worker', err);
  }
}

/**
 * Gracefully close the queue and worker.
 * Call this during application shutdown to allow in-flight jobs to complete.
 */
export async function closeFacebookTokenRefreshJob(): Promise<void> {
  const closePromises: Promise<void>[] = [];

  if (_worker) {
    closePromises.push(_worker.close());
    _worker = null;
  }
  if (_queue) {
    closePromises.push(_queue.close());
    _queue = null;
  }

  await Promise.allSettled(closePromises);
  logger.info('[FacebookTokenRefresh] Queue and worker closed');
}
