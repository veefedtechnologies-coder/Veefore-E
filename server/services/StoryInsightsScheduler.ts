/**
 * StoryInsightsScheduler — Story-Insights Hard-Deadline Handling
 *
 * Instagram stories expire 24 hours after publish, after which their insights
 * become permanently unavailable. This scheduler guarantees that story insights
 * are captured before that hard deadline by combining two BullMQ jobs per story:
 *
 *   1. A recurring `Story_Insights_Job` that polls at `storyRecurringIntervalMs`
 *      while the story is active (smart-polling-system Req 5.1).
 *   2. A single guaranteed `Final_Fetch_Job` scheduled to fire a configurable
 *      lead time before the 24h expiry (Req 5.2).
 *
 * The final fetch overrides headroom-based deferral while the account is NOT in
 * Critical tier (Req 5.3); while Critical it defers per the existing tier policy
 * (Req 5.4). A Critical deferral that survives to expiry records the story as
 * not-captured and stops (Req 5.5). Meta error code 10 (<5 viewers) is recorded
 * as insufficient data — marked complete, never retried, never logged as an
 * error (Req 5.6). Any other failure before expiry is retried with full-jitter
 * backoff bounded to complete before expiry (Req 5.7). A successful final fetch
 * cancels the recurring polling (Req 5.9). A received story-insights webhook
 * does NOT replace this safety net — the recurring and final jobs keep running
 * (Req 5.8).
 *
 * Uses a dedicated BullMQ queue following the `metricsQueue` queue patterns,
 * including graceful degradation when `REDIS_URL` is not configured.
 *
 * smart-polling-system Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9
 */

import { Queue, QueueOptions } from 'bullmq';
import { getSharedRedisConnection } from '../lib/redis';
import { logger } from '../config/logger';
import { rateLimitConfig, type RateLimitConfig } from '../config/rateLimitConfig';
import { UsageStore, UsageTier } from './UsageStore';
import { TieredJobScheduler } from './TieredJobScheduler';
import { computeJitterOffset } from '../utils/deterministicJitter';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** BullMQ queue name for story-insights polling + final-fetch jobs. */
const STORY_INSIGHTS_QUEUE_NAME = 'story-insights';

/** Job name used for both recurring and final-fetch jobs on the queue. */
const STORY_INSIGHTS_JOB_NAME = 'story-insights';

/** Deterministic-jitter job type tag for the recurring story poll (Req 7.1). */
const STORY_RECURRING_JOB_TYPE = 'story_insights';

/** Meta Graph API error code indicating fewer than 5 viewers / insufficient data. */
export const STORY_INSUFFICIENT_VIEWERS_ERROR_CODE = 10;

/** Base delay (ms) for the full-jitter retry backoff of a failed final fetch. */
const STORY_RETRY_BACKOFF_BASE_MS = 30_000; // 30 seconds
/** Maximum per-attempt backoff ceiling (ms) before the full-jitter randomization. */
const STORY_RETRY_BACKOFF_MAX_MS = 10 * 60_000; // 10 minutes

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Payload carried by every story-insights job (recurring and final).
 *
 * Mirrors the design's `StoryInsightsJobData` shape. The `kind` discriminator
 * distinguishes the recurring safety-net poll from the single guaranteed
 * pre-expiry final fetch.
 */
export interface StoryInsightsJobData {
  /** Instagram account ID that owns the story. */
  accountId: string;
  /** The story media ID. */
  storyId: string;
  /** Story publish time as a Unix epoch in milliseconds. */
  publishTimeMs: number;
  /** Which job this payload represents. */
  kind: 'recurring' | 'final';
}

/**
 * Outcome of a {@link StoryInsightsScheduler.runFinalFetch} attempt. Returned so
 * callers (and tests) can assert the exact branch taken without inspecting logs.
 */
export type FinalFetchOutcome =
  /** Account in Critical tier and not yet expired — deferred per tier policy (Req 5.4). */
  | { status: 'deferred'; reason: 'critical_tier' }
  /** Critical deferral survived to expiry — recorded not-captured, stopped (Req 5.5). */
  | { status: 'not_captured'; reason: 'expired_in_critical' }
  /** Meta error code 10 (<5 viewers) — complete, no retry, not an error (Req 5.6). */
  | { status: 'insufficient_data' }
  /** Final fetch succeeded; recurring polling cancelled (Req 5.9). */
  | { status: 'success' }
  /** A non-code-10 failure was retried with full-jitter backoff before expiry (Req 5.7). */
  | { status: 'retry_scheduled'; nextAttemptAtMs: number; delayMs: number }
  /** Failure with no time left to retry before expiry — stop (Req 5.7 bound). */
  | { status: 'failed_no_retry'; reason: string };

/**
 * Performs the actual story-insights API fetch. Injected so the scheduler stays
 * testable and the live wiring (task 11.2) can route the request through the
 * `GovernedHttpClient`. Resolves on success; rejects with a Meta-shaped error
 * (carrying `code` / `error.code`) on failure so error code 10 can be detected.
 */
export type StoryInsightsFetcher = (data: StoryInsightsJobData) => Promise<unknown>;

// ---------------------------------------------------------------------------
// Queue Setup (graceful degradation when Redis is unavailable)
// ---------------------------------------------------------------------------

let storyInsightsQueue: Queue<StoryInsightsJobData> | null = null;

/**
 * Lazily initialize the `story-insights` BullMQ queue using the shared Redis
 * connection pool. Returns null when `REDIS_URL` is not configured (graceful
 * degradation, mirroring `metricsQueue.ts` / `BackfillService`).
 */
function getStoryInsightsQueue(): Queue<StoryInsightsJobData> | null {
  if (storyInsightsQueue) return storyInsightsQueue;

  if (!process.env.REDIS_URL) {
    logger.warn('[StoryInsightsScheduler] No REDIS_URL configured, story-insights queue disabled', {
      component: 'StoryInsightsScheduler',
    });
    return null;
  }

  try {
    const connection = getSharedRedisConnection();
    const queueOptions: QueueOptions = {
      connection,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: rateLimitConfig.maxRetries,
        backoff: {
          type: 'exponential',
          delay: STORY_RETRY_BACKOFF_BASE_MS,
        },
      },
    };

    storyInsightsQueue = new Queue<StoryInsightsJobData>(STORY_INSIGHTS_QUEUE_NAME, queueOptions);
    logger.info('[StoryInsightsScheduler] Story-insights queue initialized', {
      component: 'StoryInsightsScheduler',
    });
    return storyInsightsQueue;
  } catch (error) {
    logger.warn('[StoryInsightsScheduler] Failed to initialize story-insights queue', {
      component: 'StoryInsightsScheduler',
      error: (error as Error).message,
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// StoryInsightsScheduler
// ---------------------------------------------------------------------------

export class StoryInsightsScheduler {
  private readonly scheduler: TieredJobScheduler;
  private readonly usageStore: UsageStore;
  private readonly config: RateLimitConfig;
  private readonly fetcher: StoryInsightsFetcher;

  /**
   * @param scheduler   Existing TieredJobScheduler (reused for tier policy).
   * @param usageStore  Existing per-account UsageStore (tier lookups).
   * @param config      Resolved RateLimitConfig; defaults to the singleton.
   * @param fetcher     Performs the story-insights API fetch (injected for the
   *                    live `GovernedHttpClient` wiring + testability). Defaults
   *                    to a stub that rejects so an un-wired final fetch fails
   *                    loudly rather than silently "succeeding".
   */
  constructor(
    scheduler: TieredJobScheduler,
    usageStore: UsageStore,
    config: RateLimitConfig = rateLimitConfig,
    fetcher?: StoryInsightsFetcher
  ) {
    this.scheduler = scheduler;
    this.usageStore = usageStore;
    this.config = config;
    this.fetcher =
      fetcher ??
      (async () => {
        throw new Error(
          '[StoryInsightsScheduler] No story-insights fetcher wired; cannot perform final fetch'
        );
      });
  }

  // -------------------------------------------------------------------------
  // Pure helpers (exported as static for property testing)
  // -------------------------------------------------------------------------

  /**
   * Compute the final-fetch fire delay (ms) from the story publish time
   * (smart-polling-system Req 5.2):
   *
   *   delay = (publishTimeMs + storyLifetimeMs − storyFinalFetchLeadMs) − now
   *
   * The result may be negative when the story is already near or past its
   * pre-expiry lead window; callers clamp to 0 to fire immediately.
   */
  static computeFinalFetchDelayMs(
    publishTimeMs: number,
    now: number,
    config: RateLimitConfig
  ): number {
    const { storyLifetimeMs, storyFinalFetchLeadMs } = config.smartPolling;
    const finalFetchAtMs = publishTimeMs + storyLifetimeMs - storyFinalFetchLeadMs;
    return finalFetchAtMs - now;
  }

  /**
   * The absolute hard-deadline timestamp (ms) at which the story expires and its
   * insights become permanently unavailable.
   */
  static storyExpiryMs(publishTimeMs: number, config: RateLimitConfig): number {
    return publishTimeMs + config.smartPolling.storyLifetimeMs;
  }

  /**
   * Is a retry attempt still safely schedulable before the story expires
   * (smart-polling-system Req 5.7)? True only when the next attempt is scheduled
   * to complete strictly before the 24h expiry.
   */
  static canRetryBeforeExpiry(
    publishTimeMs: number,
    nextAttemptAtMs: number,
    config: RateLimitConfig
  ): boolean {
    return nextAttemptAtMs < StoryInsightsScheduler.storyExpiryMs(publishTimeMs, config);
  }

  /**
   * Detect Meta error code 10 (fewer than 5 viewers / insufficient data) across
   * the common error shapes the Graph API / GovernedHttpClient can surface.
   */
  static isInsufficientViewersError(error: unknown): boolean {
    if (error == null || typeof error !== 'object') {
      return false;
    }
    const e = error as Record<string, any>;
    const code =
      e.code ??
      e.metaErrorCode ??
      e.errorCode ??
      e?.error?.code ??
      e?.response?.data?.error?.code;
    return Number(code) === STORY_INSUFFICIENT_VIEWERS_ERROR_CODE;
  }

  // -------------------------------------------------------------------------
  // Job ID helpers (deterministic so jobs are diffable / cancellable)
  // -------------------------------------------------------------------------

  private static recurringJobId(accountId: string, storyId: string): string {
    return `story-insights-recurring-${accountId}-${storyId}`;
  }

  private static finalJobId(accountId: string, storyId: string): string {
    return `story-insights-final-${accountId}-${storyId}`;
  }

  // -------------------------------------------------------------------------
  // Scheduling
  // -------------------------------------------------------------------------

  /**
   * On story detection (smart-polling-system Req 5.1, 5.2):
   *  - schedule a recurring Story_Insights_Job every `storyRecurringIntervalMs`
   *    (first fire spread by deterministic jitter to avoid thundering herd)
   *  - schedule one Final_Fetch_Job with delay = `computeFinalFetchDelayMs(...)`
   *    (clamped to 0 if the story is already inside its pre-expiry lead window)
   *
   * No-op (logged) when the queue is unavailable (graceful degradation).
   */
  async onStoryDetected(accountId: string, storyId: string, publishTimeMs: number): Promise<void> {
    const queue = getStoryInsightsQueue();
    if (!queue) {
      logger.warn('[StoryInsightsScheduler] Queue unavailable, skipping story scheduling', {
        component: 'StoryInsightsScheduler',
        accountId,
        storyId,
      });
      return;
    }

    const now = Date.now();
    const recurringIntervalMs = this.config.smartPolling.storyRecurringIntervalMs;

    // Req 5.1 — recurring safety-net poll while the story is active.
    const recurringJobId = StoryInsightsScheduler.recurringJobId(accountId, storyId);
    const jitterDelayMs = computeJitterOffset(
      accountId,
      `${STORY_RECURRING_JOB_TYPE}:${storyId}`,
      recurringIntervalMs,
      this.config.smartPolling.jitterSpreadFraction
    );

    try {
      await queue.add(
        STORY_INSIGHTS_JOB_NAME,
        { accountId, storyId, publishTimeMs, kind: 'recurring' } as StoryInsightsJobData,
        {
          repeat: { every: recurringIntervalMs, key: recurringJobId } as any,
          jobId: recurringJobId,
          // Deterministic first-fire jitter (Req 7.1); later occurrences fire at
          // the base interval with no re-applied offset.
          delay: jitterDelayMs,
        }
      );
    } catch (error) {
      logger.error('[StoryInsightsScheduler] Failed to schedule recurring story poll', {
        component: 'StoryInsightsScheduler',
        accountId,
        storyId,
        error: (error as Error).message,
      });
    }

    // Req 5.2 — single guaranteed final fetch before the 24h expiry.
    const rawDelay = StoryInsightsScheduler.computeFinalFetchDelayMs(publishTimeMs, now, this.config);
    const finalDelayMs = Math.max(0, rawDelay);
    const finalJobId = StoryInsightsScheduler.finalJobId(accountId, storyId);

    try {
      await queue.add(
        STORY_INSIGHTS_JOB_NAME,
        { accountId, storyId, publishTimeMs, kind: 'final' } as StoryInsightsJobData,
        {
          delay: finalDelayMs,
          jobId: finalJobId,
        }
      );
      logger.info('[StoryInsightsScheduler] Scheduled story recurring + final-fetch jobs', {
        component: 'StoryInsightsScheduler',
        accountId,
        storyId,
        recurringIntervalMs,
        finalDelayMs,
      });
    } catch (error) {
      logger.error('[StoryInsightsScheduler] Failed to schedule final-fetch job', {
        component: 'StoryInsightsScheduler',
        accountId,
        storyId,
        error: (error as Error).message,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Final fetch execution
  // -------------------------------------------------------------------------

  /**
   * Execute the guaranteed pre-expiry final fetch (smart-polling-system Req
   * 5.3–5.7, 5.9). See {@link FinalFetchOutcome} for the exact branches.
   *
   * @param data    The final-fetch job payload.
   * @param options Optional `now`/`attempt` injection for deterministic testing.
   *                `attempt` is the zero-based retry count (BullMQ `attemptsMade`).
   */
  async runFinalFetch(
    data: StoryInsightsJobData,
    options: { now?: number; attempt?: number } = {}
  ): Promise<FinalFetchOutcome> {
    const now = options.now ?? Date.now();
    const attempt = options.attempt ?? 0;
    const { accountId, storyId, publishTimeMs } = data;
    const expiryMs = StoryInsightsScheduler.storyExpiryMs(publishTimeMs, this.config);

    const tier = await this.usageStore.getTier(accountId);

    // Req 5.4 / 5.5 — Critical tier defers per the existing tier policy.
    if (tier === UsageTier.CRITICAL) {
      if (now >= expiryMs) {
        // Req 5.5 — deferral survived to expiry: record not-captured and stop.
        await this.recordNotCaptured(accountId, storyId);
        await this.cancelRecurringPolling(accountId, storyId);
        return { status: 'not_captured', reason: 'expired_in_critical' };
      }
      // Req 5.4 — still time left, but Critical: defer rather than execute.
      logger.info('[StoryInsightsScheduler] Final fetch deferred — account in Critical tier', {
        component: 'StoryInsightsScheduler',
        accountId,
        storyId,
      });
      return { status: 'deferred', reason: 'critical_tier' };
    }

    // Req 5.3 — non-Critical overrides headroom-based deferral and executes now.
    try {
      await this.fetcher(data);
      // Req 5.9 — success cancels the recurring safety-net polling.
      await this.cancelRecurringPolling(accountId, storyId);
      logger.info('[StoryInsightsScheduler] Final fetch succeeded; recurring polling cancelled', {
        component: 'StoryInsightsScheduler',
        accountId,
        storyId,
      });
      return { status: 'success' };
    } catch (error) {
      // Req 5.6 — error code 10 (<5 viewers): record insufficient data, mark
      // complete, no retry, NOT logged as an error.
      if (StoryInsightsScheduler.isInsufficientViewersError(error)) {
        logger.info('[StoryInsightsScheduler] Story had fewer than 5 viewers (error 10) — insufficient data', {
          component: 'StoryInsightsScheduler',
          accountId,
          storyId,
          result: 'insufficient_data',
        });
        await this.cancelRecurringPolling(accountId, storyId);
        return { status: 'insufficient_data' };
      }

      // Req 5.7 — other failure before expiry: full-jitter backoff retry, bounded
      // so the next attempt is scheduled to complete before the 24h expiry.
      const delayMs = StoryInsightsScheduler.computeFullJitterBackoffMs(attempt);
      const nextAttemptAtMs = now + delayMs;

      if (StoryInsightsScheduler.canRetryBeforeExpiry(publishTimeMs, nextAttemptAtMs, this.config)) {
        await this.scheduleRetry(data, delayMs);
        logger.warn('[StoryInsightsScheduler] Final fetch failed; scheduled full-jitter retry before expiry', {
          component: 'StoryInsightsScheduler',
          accountId,
          storyId,
          attempt,
          delayMs,
          error: (error as Error).message,
        });
        return { status: 'retry_scheduled', nextAttemptAtMs, delayMs };
      }

      // No time left to retry before expiry — stop.
      logger.warn('[StoryInsightsScheduler] Final fetch failed with no time to retry before expiry', {
        component: 'StoryInsightsScheduler',
        accountId,
        storyId,
        error: (error as Error).message,
      });
      await this.recordNotCaptured(accountId, storyId);
      return { status: 'failed_no_retry', reason: (error as Error).message };
    }
  }

  /**
   * Acknowledge a received story-insights webhook WITHOUT cancelling the
   * recurring poll or the final fetch (smart-polling-system Req 5.8). The
   * webhook is treated as supplementary data, never as a replacement for the
   * guaranteed safety net.
   */
  onStoryInsightsWebhook(accountId: string, storyId: string): void {
    // Intentionally a no-op with respect to the scheduled jobs — Req 5.8.
    logger.info('[StoryInsightsScheduler] Story-insights webhook received; safety-net jobs left intact', {
      component: 'StoryInsightsScheduler',
      accountId,
      storyId,
    });
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /**
   * Full-jitter backoff (smart-polling-system Req 5.7): a randomized delay in
   * `[0, min(base × 2^attempt, cap)]`. Matches the full-jitter strategy used
   * elsewhere (BullMQ `backoff.jitter`).
   */
  static computeFullJitterBackoffMs(attempt: number): number {
    const safeAttempt = Number.isFinite(attempt) && attempt > 0 ? Math.floor(attempt) : 0;
    const ceiling = Math.min(
      STORY_RETRY_BACKOFF_BASE_MS * Math.pow(2, safeAttempt),
      STORY_RETRY_BACKOFF_MAX_MS
    );
    return Math.floor(Math.random() * ceiling);
  }

  /**
   * Re-enqueue a one-shot final fetch after a delay (the bounded retry path).
   */
  private async scheduleRetry(data: StoryInsightsJobData, delayMs: number): Promise<void> {
    const queue = getStoryInsightsQueue();
    if (!queue) return;

    const finalJobId = StoryInsightsScheduler.finalJobId(data.accountId, data.storyId);
    try {
      // Distinct jobId suffix so the retry is not deduplicated against the
      // original final job (which has already run).
      await queue.add(
        STORY_INSIGHTS_JOB_NAME,
        { ...data, kind: 'final' },
        { delay: delayMs, jobId: `${finalJobId}-retry-${Date.now()}` }
      );
    } catch (error) {
      logger.error('[StoryInsightsScheduler] Failed to schedule final-fetch retry', {
        component: 'StoryInsightsScheduler',
        accountId: data.accountId,
        storyId: data.storyId,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Cancel the recurring story-insights polling for a story (Req 5.9, and the
   * stop-on-expiry path of Req 5.5). Removes the repeatable job by its
   * deterministic key. Safe no-op when the queue is unavailable.
   */
  async cancelRecurringPolling(accountId: string, storyId: string): Promise<void> {
    const queue = getStoryInsightsQueue();
    if (!queue) return;

    const recurringJobId = StoryInsightsScheduler.recurringJobId(accountId, storyId);
    try {
      await queue.removeRepeatableByKey(recurringJobId);
      logger.info('[StoryInsightsScheduler] Cancelled recurring story polling', {
        component: 'StoryInsightsScheduler',
        accountId,
        storyId,
      });
    } catch (error) {
      logger.warn('[StoryInsightsScheduler] Failed to cancel recurring story polling', {
        component: 'StoryInsightsScheduler',
        accountId,
        storyId,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Record that a story's insights were not captured before its 24h expiry
   * (smart-polling-system Req 5.5). Logged at `warn` (operational visibility) —
   * the persistence sink is wired in task 11.2.
   */
  private async recordNotCaptured(accountId: string, storyId: string): Promise<void> {
    logger.warn('[StoryInsightsScheduler] Story insights NOT captured before expiry', {
      component: 'StoryInsightsScheduler',
      accountId,
      storyId,
      result: 'not_captured',
    });
  }

  /**
   * Expose the queue for external consumers (e.g. the worker that processes
   * story-insights jobs, wired in task 11.2). Returns null when Redis is
   * unavailable.
   */
  static getQueue(): Queue<StoryInsightsJobData> | null {
    return getStoryInsightsQueue();
  }
}
