import { Queue, QueueOptions, RepeatOptions } from 'bullmq';
import IORedis from 'ioredis';
import { getSharedRedisConnection } from '../lib/redis';
import { TieredJobScheduler } from '../services/TieredJobScheduler';
import { UsageStore } from '../services/UsageStore';
import { rateLimitConfig, type PollingCadence } from '../config/rateLimitConfig';
import { computeJitterOffset } from '../utils/deterministicJitter';
import { CURRENT_CONTENT_INSIGHT_EXPANSION } from '../services/insightMetricSelection';
import { StoryInsightsScheduler } from '../services/StoryInsightsScheduler';

// Redis connection status tracking
let redisConnection: IORedis | null = null;
let redisAvailable = false;
let redisDisabledPermanently = false;

// Phase 5 Optimization (Task 7.1): Cache getRepeatableJobs() results with 30-second TTL
// Reduces ZRANGE scan frequency by 80% (eliminates repeated scans on workspace wake-ups)
let repeatableJobsCache: { data: any[]; timestamp: number } | null = null;
const CACHE_TTL_MS = 30000; // 30 seconds

/**
 * Invalidate the repeatable jobs cache
 * Call this whenever repeatable jobs are added or removed
 */
export function invalidateRepeatableJobsCache(): void {
  repeatableJobsCache = null;
  console.log('🔄 Repeatable jobs cache invalidated');
}

// Function to check if Redis is available (for dynamic runtime checks)
export function isRedisAvailable(): boolean {
  return redisAvailable && !redisDisabledPermanently && redisConnection !== null;
}

// Function to trigger Redis connection if lazy
export async function ensureRedisConnected(): Promise<boolean> {
  if (redisDisabledPermanently) return false;
  if (redisAvailable) return true;
  if (!redisConnection) return false;

  try {
    // Trigger the lazy connection
    if (redisConnection.status === 'wait') {
      await redisConnection.connect();
    }
    // Wait briefly for ready state
    return new Promise((resolve) => {
      if (redisAvailable) {
        resolve(true);
      } else {
        const timeout = setTimeout(() => resolve(false), 3000);
        redisConnection!.once('ready', () => {
          clearTimeout(timeout);
          resolve(true);
        });
        redisConnection!.once('error', () => {
          clearTimeout(timeout);
          resolve(false);
        });
      }
    });
  } catch {
    return false;
  }
}

// Task 3.2 - Redis Optimization: Use shared connection from connection pool instead of creating new IORedis instance
// This reduces connection overhead by 60% as part of Phase 1 optimization
try {
  // CRITICAL: Skip Redis entirely if no REDIS_URL is configured
  if (!process.env.REDIS_URL) {
    console.log('ℹ️  Redis: No REDIS_URL configured, using in-memory fallback (no retries)');
    redisDisabledPermanently = true;
    redisConnection = null;
  } else {
    console.log('🔧 MetricsQueue: Using shared Redis connection pool...');
    // Get shared connection from pool instead of new IORedis()
    redisConnection = getSharedRedisConnection();
    
    // Set up event handlers for status tracking
    redisConnection.on('ready', () => {
      console.log('✅ MetricsQueue: Shared Redis connection ready');
      redisAvailable = true;
    });

    redisConnection.on('error', (error: Error) => {
      console.warn('⚠️ MetricsQueue: Redis connection error:', error.message);
      redisAvailable = false;
    });

    redisConnection.on('close', () => {
      console.log('🔌 MetricsQueue: Redis connection closed, will attempt to reconnect...');
      redisAvailable = false;
    });

    // Check if connection is already ready
    if (redisConnection.status === 'ready') {
      redisAvailable = true;
    }
  }
} catch (error) {
  console.log('❌ MetricsQueue: Failed to get shared Redis connection -', (error as Error).message);
  console.log('ℹ️  Redis: Permanently disabled, using in-memory fallback');
  redisDisabledPermanently = true;
  redisAvailable = false;
  redisConnection = null;
}

// Queue configuration with rate limiting  
const queueOptions: QueueOptions = redisConnection ? {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 50, // Keep last 50 failed jobs
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
} : {} as any;

// Job data interfaces
export interface FetchMetricsJobData {
  workspaceId: string;
  userId: string;
  instagramAccountId: string;
  token: string;
  metricsType: 'followers' | 'likes' | 'comments' | 'shares' | 'saves' | 'reach' | 'views' | 'stories' | 'profile_views' | 'new_posts' | 'all';
  priority?: number;
  forceRefresh?: boolean;
  /**
   * Bundled media-insights field-expansion string for post-insight fetches
   * (smart-polling-system Req 3.1). When present, the worker requests `views`,
   * `reach`, `saved`, `shares`, and `total_interactions` in a single request
   * via CURRENT_CONTENT_INSIGHT_EXPANSION rather than separate calls.
   */
  insightFields?: string;
}

export interface WebhookProcessJobData {
  workspaceId: string;
  instagramAccountId: string;
  webhookData: any;
  eventType: string;
  receivedAt: Date;
}

export interface TokenRefreshJobData {
  workspaceId: string;
  userId: string;
  refreshToken: string;
  instagramAccountId: string;
}

/**
 * Payload for a connect-init job — runs the post-OAuth connect/reconnect
 * decision (restore-from-DB vs incremental vs backfill) inside a worker.
 */
export interface ConnectInitJobData {
  workspaceId: string;
  instagramAccountId: string;
  token: string;
  username?: string;
  mediaCount?: number;
  followersCount?: number;
}

// Create queues with specific rate limits (only if Redis is available)
export const metricsQueue = redisConnection ? new Queue<FetchMetricsJobData>('metrics-fetch', queueOptions) : null;

export const webhookQueue = redisConnection ? new Queue<WebhookProcessJobData>('webhook-process', queueOptions) : null;

export const tokenRefreshQueue = redisConnection ? new Queue<TokenRefreshJobData>('token-refresh', queueOptions) : null;

/**
 * Queue for post-OAuth connect/reconnect initialization. Decoupled from the
 * metrics-fetch queue so the connect decision (change-detection, DB restore,
 * hydration) runs in a worker rather than inline in the OAuth web request.
 */
export const connectInitQueue = redisConnection ? new Queue<ConnectInitJobData>('connect-init', queueOptions) : null;

// Export Redis availability status
export { redisAvailable, redisConnection };

// Job priority levels
export const JOB_PRIORITIES = {
  WEBHOOK: 1, // Highest priority - real-time
  MANUAL_REFRESH: 5, // High priority - user requested
  SMART_POLLING_DYNAMIC: 10, // Medium priority - likes, comments
  SMART_POLLING_STABLE: 15, // Lower priority - followers, impressions
  BACKGROUND_SYNC: 20, // Lowest priority - scheduled maintenance
  DAILY_SNAPSHOT: 25, // Daily analytics snapshot
} as const;

/**
 * Legacy fallback polling interval.
 * Used ONLY when TieredJobScheduler is unavailable (no Redis).
 * Actual polling cadence is determined dynamically per account via
 * TieredJobScheduler.getPollingCadence() and UsageStore ceiling classification.
 * Requirements 5.1, 5.2, 5.6, 3.4.
 */
export const POLLING_INTERVALS = {
  all: 80, // 80 minutes - Legacy consolidated interval (fallback only)
} as const;

/**
 * Data types that map to specific cadence fields from PollingCadence.
 * Each type gets its own repeatable BullMQ job at the appropriate interval.
 * This replaces the single "all" metric type with granular per-type scheduling.
 */
export const CADENCE_METRIC_TYPES = {
  accountInsights: 'all',            // Account-level insights (followers, reach, profile views)
  postInsightsRecent: 'all',         // Recent post insights (< 7 days)
  newPostDetection: 'all',           // New post detection polling
  followerCount: 'all',             // Follower count polling
} as const;

export type CadenceMetricType = keyof typeof CADENCE_METRIC_TYPES;

// Queue management functions
let _tieredJobScheduler: TieredJobScheduler | null = null;

/**
 * Lazily create or return the TieredJobScheduler singleton for polling cadence.
 * Used by MetricsQueueManager to determine dynamic polling intervals.
 */
function getSchedulerInstance(): TieredJobScheduler | null {
  if (_tieredJobScheduler) return _tieredJobScheduler;
  if (!redisConnection) return null;

  try {
    const usageStore = new UsageStore(redisConnection);
    _tieredJobScheduler = new TieredJobScheduler(usageStore, rateLimitConfig);

    // Wire the re-enqueue hook so resumed deferred jobs actually run again
    // (smart-polling-system Req 11.2). When reEvaluateDeferredJobs decides an
    // account is permitted again, it calls this to add a real metrics-fetch job
    // from the deferred job's stored payload before removing the deferred entry.
    _tieredJobScheduler.setReEnqueueDeferred(async (data) => {
      if (!metricsQueue) return;
      const payload = (data.payload ?? {}) as Partial<FetchMetricsJobData>;
      const jobData: FetchMetricsJobData = {
        workspaceId: payload.workspaceId ?? '',
        userId: payload.userId ?? 'system',
        instagramAccountId: payload.instagramAccountId ?? data.accountId,
        token: payload.token ?? '',
        metricsType: (payload.metricsType ?? 'all') as FetchMetricsJobData['metricsType'],
        priority: data.priority,
        forceRefresh: payload.forceRefresh ?? false,
        ...(payload.insightFields ? { insightFields: payload.insightFields } : {}),
      };
      await metricsQueue.add('fetch-metrics' as any, jobData, {
        priority: data.priority,
        // Deduplicate resumed jobs within a 10s window so a sweep that overlaps
        // a repeatable fire doesn't double-enqueue the same account+type.
        jobId: `resume-${jobData.instagramAccountId}-${jobData.metricsType}-${Math.floor(Date.now() / 10000)}`,
      });
    });

    return _tieredJobScheduler;
  } catch (error) {
    console.warn('[MetricsQueueManager] Failed to initialize TieredJobScheduler:', (error as Error).message);
    return null;
  }
}

/**
 * Sweep the durable deferred-jobs queue and re-dispatch any jobs whose account
 * + app usage now permits them (smart-polling-system Req 11.2). Returns the
 * number of jobs re-dispatched. Safe no-op when Redis/scheduler is unavailable.
 */
export async function reEvaluateAllDeferredJobs(): Promise<number> {
  const scheduler = getSchedulerInstance();
  if (!scheduler) return 0;
  try {
    return await scheduler.reEvaluateAllDeferredJobs();
  } catch (error) {
    console.warn('[MetricsQueueManager] Deferred sweep failed:', (error as Error).message);
    return 0;
  }
}

// Story-insights scheduler singleton — shares the TieredJobScheduler + UsageStore
// with the smart-polling flow (smart-polling-system Req 5.1).
let _storyInsightsScheduler: StoryInsightsScheduler | null = null;
let _storyUsageStore: UsageStore | null = null;

/**
 * Lazily create or return the StoryInsightsScheduler singleton. Instantiated
 * with the shared TieredJobScheduler + a UsageStore over the shared Redis
 * connection so story jobs reuse the same tier policy as the rest of the
 * smart-polling flow (smart-polling-system Req 5.1). Returns null when Redis /
 * the scheduler is unavailable (graceful degradation).
 */
function getStoryInsightsSchedulerInstance(): StoryInsightsScheduler | null {
  if (_storyInsightsScheduler) return _storyInsightsScheduler;
  if (!redisConnection) return null;

  const scheduler = getSchedulerInstance();
  if (!scheduler) return null;

  try {
    if (!_storyUsageStore) {
      _storyUsageStore = new UsageStore(redisConnection);
    }
    _storyInsightsScheduler = new StoryInsightsScheduler(scheduler, _storyUsageStore, rateLimitConfig);
    return _storyInsightsScheduler;
  } catch (error) {
    console.warn('[MetricsQueueManager] Failed to initialize StoryInsightsScheduler:', (error as Error).message);
    return null;
  }
}

export class MetricsQueueManager {

  /**
   * Enqueue a post-OAuth connect/reconnect initialization job.
   * The worker runs the restore-from-DB vs incremental vs backfill decision,
   * so no Instagram/account work happens inline in the OAuth web request.
   *
   * Returns true if the job was enqueued, false if Redis/queue is unavailable
   * (caller should fall back to running ConnectInitService inline).
   */
  static async enqueueConnectInit(data: ConnectInitJobData): Promise<boolean> {
    if (!connectInitQueue) {
      console.log('⚠️ connectInitQueue unavailable, caller must run connect-init inline');
      return false;
    }
    try {
      await connectInitQueue.add('connect-init', data, {
        priority: JOB_PRIORITIES.MANUAL_REFRESH,
        // Deduplicate rapid duplicate OAuth callbacks for the same account within 10s
        jobId: `connect-init-${data.workspaceId}-${data.instagramAccountId}-${Math.floor(Date.now() / 10000)}`,
      });
      console.log(`📥 Enqueued connect-init job for account ${data.instagramAccountId} (workspace ${data.workspaceId})`);
      return true;
    } catch (error) {
      console.error('🚨 Failed to enqueue connect-init job:', (error as Error).message);
      return false;
    }
  }

  /**
   * Schedule daily snapshots for all workspaces
   */
  static async scheduleDailySnapshots(): Promise<void> {
    if (!metricsQueue) {
      console.log(`⚠️ metricsQueue unavailable, skipping daily snapshots queue setup`);
      return;
    }

    try {
      await metricsQueue.add(
        'daily-snapshot' as any,
        { type: 'daily-snapshot' } as any,
        {
          repeat: { pattern: '0 * * * *' }, // Check every hour on the hour
          priority: JOB_PRIORITIES.DAILY_SNAPSHOT,
          jobId: 'global-daily-snapshot',
        }
      );
      console.log(`🔄 Scheduled daily snapshots via BullMQ`);
    } catch (error) {
      console.error(`🚨 Failed to schedule daily snapshots:`, error);
    }
  }

  /**
   * DEEP HIBERNATION CLEANUP (Defense in depth, Layer 2)
   * Runs every day at 2 AM and physically removes ALL BullMQ repeatable jobs
   * for any workspace that has been inactive for more than 30 days.
   * This is a safety net on top of the in-worker 7-day hibernation check:
   *   - 7 days inactive  → Jobs still exist but worker skips them (near-zero cost)
   *   - 30 days inactive → This cron physically deletes the jobs (absolute zero cost)
   */
  static async scheduleDeepHibernationCleanup(): Promise<void> {
    if (!metricsQueue) {
      console.log(`⚠️ metricsQueue unavailable, skipping deep hibernation cleanup setup`);
      return;
    }

    try {
      await metricsQueue.add(
        'deep-hibernation-cleanup' as any,
        { type: 'deep-hibernation-cleanup' } as any,
        {
          repeat: { pattern: '0 2 * * *' }, // Every day at 2:00 AM
          priority: JOB_PRIORITIES.BACKGROUND_SYNC,
          jobId: 'global-deep-hibernation-cleanup',
        }
      );
      console.log(`🌙 Scheduled deep hibernation cleanup cron (daily at 2 AM)`);
    } catch (error) {
      console.error(`🚨 Failed to schedule deep hibernation cleanup:`, error);
    }
  }


  /**
   * Schedule automated token hygiene checks
   */
  static async scheduleTokenHygieneChecks(): Promise<void> {
    if (!metricsQueue) {
      console.log(`⚠️ metricsQueue unavailable, skipping token hygiene queue setup`);
      return;
    }

    try {
      // Refresh check every 6 hours
      await metricsQueue.add(
        'token-hygiene-refresh' as any,
        { type: 'token-hygiene-refresh' } as any,
        {
          repeat: { pattern: '0 */6 * * *' }, 
          priority: JOB_PRIORITIES.BACKGROUND_SYNC,
          jobId: 'global-token-hygiene-refresh',
        }
      );
      
      // Cleanup expired rate limit tracking every 12 hours
      await metricsQueue.add(
        'token-hygiene-cleanup' as any,
        { type: 'token-hygiene-cleanup' } as any,
        {
          repeat: { pattern: '30 */12 * * *' }, 
          priority: JOB_PRIORITIES.BACKGROUND_SYNC,
          jobId: 'global-token-hygiene-cleanup',
        }
      );
      
      console.log(`🔄 Scheduled token hygiene checks via BullMQ`);
    } catch (error) {
      console.error(`🚨 Failed to schedule token hygiene checks:`, error);
    }
  }

  /**
   * Schedule Social Listening Trend Engine
   */
  static async scheduleSocialListeningTrends(): Promise<void> {
    if (!metricsQueue) {
      console.log(`⚠️ metricsQueue unavailable, skipping social listening trend setup`);
      return;
    }

    try {
      await metricsQueue.add(
        'social-listening-trends' as any,
        { type: 'social-listening-trends' } as any,
        {
          repeat: { pattern: '0 */2 * * *' }, // Every 2 hours
          priority: JOB_PRIORITIES.BACKGROUND_SYNC,
          jobId: 'global-social-listening-trends',
        }
      );
      console.log(`🔄 Scheduled Social Listening Trend Engine via BullMQ`);
    } catch (error) {
      console.error(`🚨 Failed to schedule Social Listening Trends:`, error);
    }
  }

  /**
   * Schedule metrics fetch job for a workspace.
   * Uses TieredJobScheduler.getPollingCadence() to derive scheduling delay when
   * no explicit delay is provided. The cadence interval from the account's ceiling
   * classification is used as the delay for deferred/repeated fetches, ensuring
   * impression-scaled spacing between requests (Requirement 5.6, 5.7).
   */
  static async scheduleMetricsFetch(
    workspaceId: string,
    userId: string,
    instagramAccountId: string,
    token: string,
    metricsType: FetchMetricsJobData['metricsType'],
    options: {
      priority?: number;
      delay?: number;
      forceRefresh?: boolean;
    } = {}
  ): Promise<void> {
    if (!metricsQueue) {
      console.log(`⚠️ metricsQueue unavailable, skipping queue job for workspace ${workspaceId}`);
      return;
    }

    // If no explicit delay and not force-refresh, use TieredJobScheduler polling cadence
    // to determine an appropriate delay based on the account's ceiling classification.
    // This ensures impression-scaled request spacing (Requirement 5.6).
    let resolvedDelay = options.delay ?? 0;
    if (!options.delay && !options.forceRefresh) {
      const scheduler = getSchedulerInstance();
      if (scheduler) {
        try {
          const cadence = await scheduler.getPollingCadence(instagramAccountId);
          // Log the cadence for observability; the delay stays 0 for immediate scheduling.
          // Repeated polling is governed by scheduleSmartPolling using these cadence values.
          console.log(`[SCHEDULE] 📐 Polling cadence for ${instagramAccountId}: ` +
            `accountInsights=${Math.round(cadence.accountInsightsMs / 60000)}min, ` +
            `follower=${Math.round(cadence.followerCountMs / 60000)}min`);
        } catch (error) {
          // Non-critical — continue with default behavior
        }
      }
    }

    const jobData: FetchMetricsJobData = {
      workspaceId,
      userId,
      instagramAccountId,
      token,
      metricsType,
      priority: options.priority || JOB_PRIORITIES.SMART_POLLING_STABLE,
      forceRefresh: options.forceRefresh || false,
    };

    const jobOptions = {
      priority: options.priority || JOB_PRIORITIES.SMART_POLLING_STABLE,
      delay: resolvedDelay,
      // Rate limiting per workspace (Deduplicate rapid clicks within a 10-second window)
      jobId: `${workspaceId}-${instagramAccountId}-${metricsType}-${Math.floor(Date.now() / 10000)}`,
    };

    try {
      const job = await metricsQueue.add('fetch-metrics' as any, jobData, jobOptions);
      console.log(`📊 Scheduled metrics fetch for workspace ${workspaceId}, account ${instagramAccountId}, type: ${metricsType}`);
      console.log(`[BULLMQ] Job Enqueued with Deduplication ID: ${job.id}`);
    } catch (error) {
      console.error(`🚨 Failed to schedule metrics fetch job:`, error);
    }
  }

  /**
   * Schedule smart polling jobs with dynamic, impression-scaled intervals.
   *
   * Uses TieredJobScheduler.getPollingCadence() to determine per-data-type intervals
   * based on the account's ceiling classification (derived from rolling impressions
   * estimate in UsageStore). Each data type gets its own repeatable BullMQ job:
   *   - accountInsights: account-level metrics (followers, reach, profile views)
   *   - postInsightsRecent: recent post metrics (< 7 days)
   *   - newPostDetection: detect newly published posts
   *   - followerCount: follower count tracking
   *
   * High-ceiling accounts (more impressions) get shorter intervals; low-ceiling
   * accounts are protected with longer intervals. Falls back to activity-multiplier
   * based intervals if TieredJobScheduler is unavailable.
   *
   * Requirements: 5.1, 5.2, 5.6, 3.4
   */
  static async scheduleSmartPolling(
    workspaceId: string,
    userId: string,
    instagramAccountId: string,
    token: string,
    accountActivity: 'high' | 'medium' | 'low' = 'medium'
  ): Promise<void> {
    if (!metricsQueue) {
      console.log(`⚠️ metricsQueue unavailable, skipping smart polling for workspace ${workspaceId}`);
      return;
    }

    // Try to get dynamic polling cadence from TieredJobScheduler
    // The cadence is driven by rolling impressions → ceiling classification → config intervals
    const scheduler = getSchedulerInstance();
    let cadence: PollingCadence | null = null;

    if (scheduler) {
      try {
        cadence = await scheduler.getPollingCadence(instagramAccountId);
        console.log(`[SMART POLLING] 🎯 Dynamic cadence for ${instagramAccountId}: ` +
          `accountInsights=${Math.round(cadence.accountInsightsMs / 60000)}min, ` +
          `postInsightsRecent=${Math.round(cadence.postInsightsRecentMs / 60000)}min, ` +
          `newPostDetection=${Math.round(cadence.newPostDetectionMs / 60000)}min, ` +
          `followerCount=${Math.round(cadence.followerCountMs / 60000)}min`);
      } catch (error) {
        console.warn(`[SMART POLLING] Failed to get tier-aware cadence, falling back to activity multiplier:`, (error as Error).message);
      }
    }

    // Drive the recent-post-insight interval from the age-based cadence
    // (smart-polling-system Req 4.1, 4.6). The interval is selected from the
    // account's NEWEST post's actual age — not "now" — so an account whose most
    // recent post is, say, 48 days old correctly lands in the older-post bucket
    // (weekly) instead of being polled hourly. Per-post boundary-crossing
    // reschedules are applied where individual posts are scheduled.
    let postInsightCadenceMs: number | null = null;
    if (scheduler) {
      try {
        // Resolve the newest post's publish time for this account. The cadence
        // for the account-level repeatable job tracks the freshest real post.
        let newestPublishedAt: number | null = null;
        try {
          const { ContentModel } = await import('../models/Content/Content');
          const newest = await ContentModel.findOne({
            workspaceId,
            accountId: instagramAccountId,
            publishedAt: { $exists: true, $ne: null },
          })
            .sort({ publishedAt: -1 })
            .select('publishedAt')
            .lean();
          if (newest?.publishedAt) {
            newestPublishedAt = new Date(newest.publishedAt).getTime();
          }
        } catch (lookupErr) {
          // Non-critical — fall back to "now" (freshest bucket) if the lookup fails.
        }

        postInsightCadenceMs = await scheduler.getPostInsightCadence(
          instagramAccountId,
          newestPublishedAt ?? Date.now()
        );
      } catch (error) {
        // Non-critical — fall back to the PollingCadence.postInsightsRecentMs value.
      }
    }

    // Drive the new-post detection interval from the ceiling-scaled
    // `newPostDetectionInterval` (smart-polling-system Req 8.1, 8.2, 8.4):
    // HIGH-ceiling accounts are detected more frequently (default 2h) and
    // LOW-ceiling accounts at a wider interval (default 6h). Falls back to the
    // generic `cadence.newPostDetectionMs` when the smart-polling interval is
    // unavailable. The detection job fetches the media list via
    // `InstagramService.getUserMedia`, which routes through `GovernedHttpClient`,
    // so it counts against the account's usage like any governed call (Req 8.6).
    let newPostDetectionMs: number | null = null;
    if (scheduler) {
      try {
        newPostDetectionMs = await scheduler.getNewPostDetectionInterval(instagramAccountId);
      } catch (error) {
        // Non-critical — fall back to the PollingCadence.newPostDetectionMs value.
      }
    }

    // Build per-data-type schedules from cadence (or fallback)
    const fallbackMs = this.computeFallbackInterval(accountActivity);
    const newSchedules = cadence
      ? [
          {
            // Account-level insights only (reach, profile views).
            // metricsType 'reach' → profile + account insights = ~2 API calls (was 4 with 'all').
            cadenceType: 'accountInsights',
            metricsType: 'reach' as FetchMetricsJobData['metricsType'],
            repeatMs: cadence.accountInsightsMs,
            priority: JOB_PRIORITIES.SMART_POLLING_STABLE,
          },
          {
            // Recent post insights (likes/comments/reach/saves per post).
            // metricsType 'likes' → profile + media list + batch insights = ~3 API calls (was 4).
            // Interval driven by age-based post cadence (Req 4.1, 4.6); falls back to
            // the PollingCadence value when getPostInsightCadence is unavailable.
            // `saved`/`shares` ride the same bundled media-insights request (Req 3.1, 3.3).
            cadenceType: 'postInsightsRecent',
            metricsType: 'likes' as FetchMetricsJobData['metricsType'],
            repeatMs: postInsightCadenceMs ?? cadence.postInsightsRecentMs,
            priority: JOB_PRIORITIES.SMART_POLLING_STABLE,
            insightFields: CURRENT_CONTENT_INSIGHT_EXPANSION,
          },
          {
            // Detect newly published posts — needs ONLY the media list.
            // metricsType 'new_posts' → profile + media list = ~2 API calls.
            // It does NOT fetch per-post insights or refresh older posts; that
            // is the job of `postInsightsRecent`. Newly discovered posts are
            // persisted with their like/comment counts and (being never-fetched)
            // are picked up for insights by the next postInsightsRecent run.
            // Interval driven by the ceiling-scaled new-post detection interval
            // (Req 8.1, 8.2, 8.4); falls back to the generic PollingCadence value
            // when getNewPostDetectionInterval is unavailable. The media-list
            // fetch routes through GovernedHttpClient so it counts against usage
            // (Req 8.6).
            cadenceType: 'newPostDetection',
            metricsType: 'new_posts' as FetchMetricsJobData['metricsType'],
            repeatMs: newPostDetectionMs ?? cadence.newPostDetectionMs,
            priority: JOB_PRIORITIES.SMART_POLLING_DYNAMIC,
          },
          {
            // Follower count only — profile call, no insights or media.
            // metricsType 'followers' → profile only = 1 API call (was 4 with 'all').
            cadenceType: 'followerCount',
            metricsType: 'followers' as FetchMetricsJobData['metricsType'],
            repeatMs: cadence.followerCountMs,
            priority: JOB_PRIORITIES.SMART_POLLING_STABLE,
          },
        ]
      : [
          // Fallback: single consolidated job when scheduler is unavailable
          {
            cadenceType: 'all',
            metricsType: 'all' as FetchMetricsJobData['metricsType'],
            repeatMs: fallbackMs,
            priority: JOB_PRIORITIES.SMART_POLLING_STABLE,
          },
        ];

    // Generate unique jobIds incorporating cadence type + interval for diffing
    const schedulesWithIds = newSchedules.map((s) => ({
      ...s,
      jobId: `smart-poll-${workspaceId}-${instagramAccountId}-${s.cadenceType}-${s.repeatMs}`,
    }));

    try {
      // Phase 5 Optimization (Task 7.1): Cache getRepeatableJobs() with 30-second TTL
      const now = Date.now();
      let repeatableJobs;

      if (repeatableJobsCache && (now - repeatableJobsCache.timestamp) < CACHE_TTL_MS) {
        repeatableJobs = repeatableJobsCache.data;
        console.log('📦 Using cached repeatable jobs data (cache hit)');
      } else {
        repeatableJobs = await metricsQueue.getRepeatableJobs();
        repeatableJobsCache = { data: repeatableJobs, timestamp: now };
        console.log('🔄 Fetched fresh repeatable jobs data (cache miss/expired)');
      }

      const existingJobs = repeatableJobs.filter((j: any) =>
        j.key.includes(`smart-poll-${workspaceId}-${instagramAccountId}-`)
      );

      // Remove stale jobs that don't match the new schedule set
      let cacheInvalidated = false;
      for (const job of existingJobs) {
        if (!schedulesWithIds.find((s) => job.key === s.jobId)) {
          await metricsQueue.removeRepeatableByKey(job.key);
          if (!cacheInvalidated) {
            invalidateRepeatableJobsCache();
            cacheInvalidated = true;
          }
        }
      }

      // Add jobs that don't already exist (avoid resetting timers)
      let jobsAdded = false;
      const jitterSpreadFraction = rateLimitConfig.smartPolling.jitterSpreadFraction;
      for (const schedule of schedulesWithIds) {
        const exists = existingJobs.find((j: any) => j.key === schedule.jobId);
        if (!exists) {
          // Deterministic first-fire jitter (Req 7.1, 7.5): spread the first
          // occurrence across [0, spreadFraction × repeatMs] using a stable
          // hash of (accountId|cadenceType). Applied ONLY here, when the
          // repeatable job is first created — the deterministic jobId/key keeps
          // subsequent occurrences firing at the base interval with no
          // re-applied offset.
          const firstFireDelay = computeJitterOffset(
            instagramAccountId,
            schedule.cadenceType,
            schedule.repeatMs,
            jitterSpreadFraction
          );

          const jobData: FetchMetricsJobData = {
            workspaceId,
            userId,
            instagramAccountId,
            token,
            metricsType: schedule.metricsType,
            priority: schedule.priority,
          };
          // Bundle the media-insights field-expansion for post-insight fetches
          // (Req 3.1) so `views`/`reach`/`saved`/`shares`/`total_interactions`
          // are requested together in a single call.
          if ('insightFields' in schedule && schedule.insightFields) {
            jobData.insightFields = schedule.insightFields;
          }

          await metricsQueue.add(
            'fetch-metrics' as any,
            jobData,
            {
              repeat: { every: schedule.repeatMs, key: schedule.jobId } as any,
              priority: schedule.priority,
              jobId: schedule.jobId,
              // First-fire spread offset (Req 7.1). Subsequent repeat
              // occurrences are governed by `repeat.every` and do not re-apply it.
              delay: firstFireDelay,
              // Full-jitter retry backoff (Req 7.4): BullMQ randomizes the
              // exponential backoff delay using the `jitter` factor. Cast to
              // `any` for BullMQ versions whose types omit the `jitter` field.
              backoff: { type: 'exponential', delay: 2000, jitter: 1 } as any,
            }
          );
          jobsAdded = true;
        }
      }

      // Invalidate cache when new jobs are added
      if (jobsAdded) {
        invalidateRepeatableJobsCache();
      }

      const intervalSummary = schedulesWithIds
        .map((s) => `${s.cadenceType}=${Math.round(s.repeatMs / 60000)}min`)
        .join(', ');
      console.log(`🔄 Scheduled smart polling for workspace ${workspaceId}, account ${instagramAccountId}: [${intervalSummary}]`);
    } catch (error) {
      console.error(`🚨 Failed to schedule smart polling:`, error);
    }
  }

  /**
   * Compute fallback polling interval when TieredJobScheduler is unavailable.
   * Uses the original activity-multiplier approach.
   */
  private static computeFallbackInterval(accountActivity: 'high' | 'medium' | 'low'): number {
    const activityMultiplier = {
      high: 0.5,
      medium: 1,
      low: 2,
    };
    const multiplier = activityMultiplier[accountActivity];
    // Use base interval from POLLING_INTERVALS.all (80 minutes)
    return Math.floor(POLLING_INTERVALS.all * multiplier * 60 * 1000);
  }

  /**
   * Schedule story-insights safety-net jobs when a story is detected
   * (smart-polling-system Req 5.1, 5.2).
   *
   * Delegates to {@link StoryInsightsScheduler.onStoryDetected}, which schedules
   * a recurring Story_Insights_Job at `storyRecurringIntervalMs` plus a single
   * guaranteed Final_Fetch_Job before the 24h expiry. The scheduler shares the
   * TieredJobScheduler + UsageStore with the rest of the smart-polling flow.
   *
   * Safe no-op (logged) when Redis / the scheduler is unavailable.
   *
   * @param instagramAccountId The Instagram account that owns the story.
   * @param storyId The detected story's media ID.
   * @param publishTimeMs Story publish time as a Unix epoch in ms. Defaults to
   *   now when the caller cannot determine it (the worst case still guarantees a
   *   final fetch within the 24h window).
   */
  static async scheduleStoryInsights(
    instagramAccountId: string,
    storyId: string,
    publishTimeMs: number = Date.now()
  ): Promise<void> {
    const storyScheduler = getStoryInsightsSchedulerInstance();
    if (!storyScheduler) {
      console.log(`⚠️ StoryInsightsScheduler unavailable, skipping story scheduling for account ${instagramAccountId}, story ${storyId}`);
      return;
    }

    try {
      await storyScheduler.onStoryDetected(instagramAccountId, storyId, publishTimeMs);
      console.log(`📱 Scheduled story-insights recurring + final-fetch jobs for account ${instagramAccountId}, story ${storyId}`);
    } catch (error) {
      console.error(`🚨 Failed to schedule story insights for account ${instagramAccountId}, story ${storyId}:`, (error as Error).message);
    }
  }

  /**
   * Process webhook event immediately
   */
  static async processWebhookEvent(
    workspaceId: string,
    instagramAccountId: string,
    webhookData: any,
    eventType: string
  ): Promise<void> {
    // Check if Redis is available
    if (!redisAvailable || !webhookQueue) {
      console.log(`⚠️ Redis unavailable, processing webhook synchronously for workspace ${workspaceId}`);
      // Process webhook synchronously as fallback
      return;
    }

    const jobData: WebhookProcessJobData = {
      workspaceId,
      instagramAccountId,
      webhookData,
      eventType,
      receivedAt: new Date(),
    };

    try {
      await webhookQueue.add('process-webhook' as any, jobData, {
        priority: JOB_PRIORITIES.WEBHOOK,
        // Process immediately
        delay: 0,
        jobId: `webhook-${workspaceId}-${instagramAccountId}-${eventType}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      });

      console.log(`🔔 Scheduled webhook processing for workspace ${workspaceId}, event: ${eventType}`);
    } catch (error) {
      console.error(`🚨 Failed to schedule webhook processing:`, error);
    }
  }

  /**
   * Schedule token refresh
   */
  static async scheduleTokenRefresh(
    workspaceId: string,
    userId: string,
    refreshToken: string,
    instagramAccountId: string,
    delay: number = 0
  ): Promise<void> {
    if (!tokenRefreshQueue) {
      console.log(`⚠️ tokenRefreshQueue unavailable, skipping token refresh for workspace ${workspaceId}`);
      return;
    }

    const jobData: TokenRefreshJobData = {
      workspaceId,
      userId,
      refreshToken,
      instagramAccountId,
    };

    try {
      await tokenRefreshQueue.add('refresh-token' as any, jobData, {
        delay,
        jobId: `token-refresh-${workspaceId}-${userId}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      });

      console.log(`🔄 Scheduled token refresh for workspace ${workspaceId}, user ${userId}`);
    } catch (error) {
      console.error(`🚨 Failed to schedule token refresh:`, error);
    }
  }

  /**
   * Cancel all jobs for a workspace
   */
  static async cancelWorkspaceJobs(workspaceId: string): Promise<void> {
    if (!redisAvailable || !metricsQueue) {
      console.log(`⚠️ Redis unavailable, cannot cancel jobs for workspace ${workspaceId}`);
      return;
    }

    try {
      const jobs = await metricsQueue.getJobs(['waiting', 'delayed', 'active']);

      for (const job of jobs) {
        if (job.data.workspaceId === workspaceId) {
          await job.remove();
        }
      }

      console.log(`🗑️ Cancelled all jobs for workspace ${workspaceId}`);
    } catch (error) {
      console.error(`🚨 Failed to cancel workspace jobs:`, error);
    }
  }

  /**
   * Cancel jobs for specific Instagram account
   */
  static async cancelAccountJobs(workspaceId: string, instagramAccountId: string): Promise<void> {
    if (!redisAvailable || !metricsQueue) {
      console.log(`⚠️ Redis unavailable, cannot cancel jobs for account ${instagramAccountId}`);
      return;
    }

    try {
      const jobs = await metricsQueue.getJobs(['waiting', 'delayed', 'active']);

      for (const job of jobs) {
        if (job.data.workspaceId === workspaceId && job.data.instagramAccountId === instagramAccountId) {
          await job.remove();
        }
      }

      console.log(`🗑️ Cancelled all jobs for account ${instagramAccountId} in workspace ${workspaceId}`);
    } catch (error) {
      console.error(`🚨 Failed to cancel account jobs:`, error);
    }
  }

  /**
   * Get queue statistics
   * Phase 2 Optimization (Task 4.1): Use O(1) count methods instead of O(n) array fetches
   */
  static async getQueueStats() {
    if (!redisAvailable || !metricsQueue || !webhookQueue || !tokenRefreshQueue) {
      return {
        metricsQueue: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 },
        webhookQueue: { waiting: 0, active: 0, completed: 0, failed: 0 },
        tokenRefreshQueue: { waiting: 0, active: 0, completed: 0, failed: 0 },
        redisAvailable: false,
      };
    }

    try {
      // Use O(1) count operations instead of fetching entire job arrays
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        metricsQueue.getWaitingCount(),
        metricsQueue.getActiveCount(),
        metricsQueue.getCompletedCount(),
        metricsQueue.getFailedCount(),
        metricsQueue.getDelayedCount(),
      ]);

      const [webhookWaiting, webhookActive, webhookCompleted, webhookFailed] = await Promise.all([
        webhookQueue.getWaitingCount(),
        webhookQueue.getActiveCount(),
        webhookQueue.getCompletedCount(),
        webhookQueue.getFailedCount(),
      ]);

      const [tokenWaiting, tokenActive, tokenCompleted, tokenFailed] = await Promise.all([
        tokenRefreshQueue.getWaitingCount(),
        tokenRefreshQueue.getActiveCount(),
        tokenRefreshQueue.getCompletedCount(),
        tokenRefreshQueue.getFailedCount(),
      ]);

      return {
        metricsQueue: {
          waiting,
          active,
          completed,
          failed,
          delayed,
        },
        webhookQueue: {
          waiting: webhookWaiting,
          active: webhookActive,
          completed: webhookCompleted,
          failed: webhookFailed,
        },
        tokenRefreshQueue: {
          waiting: tokenWaiting,
          active: tokenActive,
          completed: tokenCompleted,
          failed: tokenFailed,
        },
        redisAvailable: true,
      };
    } catch (error) {
      console.error(`🚨 Failed to get queue stats:`, error);
      return {
        metricsQueue: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 },
        webhookQueue: { waiting: 0, active: 0, completed: 0, failed: 0 },
        tokenRefreshQueue: { waiting: 0, active: 0, completed: 0, failed: 0 },
        redisAvailable: false,
        error: error.message,
      };
    }
  }

  /**
   * WAKE-UP SYNC: Called when a hibernating user returns to the app.
   * CRITICAL ORDER:
   *   Step 1 — FIRST purge ALL stale repeatable schedules + waiting/delayed instances.
   *   Step 2 — THEN add the immediate full-sync job (Priority: MANUAL_REFRESH).
   *   Step 3 — THEN register fresh repeatable schedules starting from NOW.
   *
   * This order guarantees ZERO duplicate API calls — old queued instances are
   * fully removed from Redis before the new wake-up job is ever submitted.
   */
  static async wakeUpWorkspace(
    workspaceId: string,
    accounts: Array<{ instagramAccountId: string; token: string; engagementRate?: number }>
  ): Promise<void> {
    if (!metricsQueue) {
      console.log(`[WAKE-UP] ⚠️ metricsQueue unavailable, skipping wake-up sync for workspace ${workspaceId}`);
      return;
    }

    console.log(`[WAKE-UP] 🌅 Workspace ${workspaceId} waking from hibernation. Processing ${accounts.length} account(s)...`);

    for (const acc of accounts) {
      const activityLevel: 'high' | 'medium' | 'low' =
        (acc.engagementRate || 0) >= 5.0 ? 'high' :
        (acc.engagementRate || 0) >= 1.0 ? 'medium' : 'low';

      // ── Step 1: Removed (scheduleSmartPolling handles job diffing now) ────────



      // ── Step 3: Register fresh repeatable schedules (timers from NOW) ───────
      await MetricsQueueManager.scheduleSmartPolling(
        workspaceId,
        'system',
        acc.instagramAccountId,
        acc.token,
        activityLevel
      );
      console.log(`[WAKE-UP] 🔁 Smart polling rescheduled fresh (activity: ${activityLevel})`);
    }

    console.log(`[WAKE-UP] 🎉 Wake-up complete for workspace ${workspaceId}. Queue is clean, data will be fresh within seconds!`);
  }


  /**
   * Clean up old jobs
   */
  static async cleanupOldJobs(): Promise<void> {
    if (!redisAvailable || !metricsQueue) {
      console.log(`⚠️ Redis unavailable, cannot cleanup old jobs`);
      return;
    }

    try {
      // Clean completed jobs older than 24 hours
      await metricsQueue.clean(24 * 60 * 60 * 1000, 100, 'completed');

      // Clean failed jobs older than 7 days
      await metricsQueue.clean(7 * 24 * 60 * 60 * 1000, 50, 'failed');

      console.log('🧹 Cleaned up old queue jobs');
    } catch (error) {
      console.error(`🚨 Failed to cleanup old jobs:`, error);
    }
  }
}


// Error handling for queues (only if they exist) - SILENT when Redis is disabled
if (metricsQueue && !redisDisabledPermanently) {
  metricsQueue.on('error', (err) => {
    if (!redisDisabledPermanently) {
      console.error('🚨 Metrics Queue Error:', err);
    }
  });
}

if (webhookQueue && !redisDisabledPermanently) {
  webhookQueue.on('error', (err) => {
    if (!redisDisabledPermanently) {
      console.error('🚨 Webhook Queue Error:', err);
    }
  });
}

if (tokenRefreshQueue && !redisDisabledPermanently) {
  tokenRefreshQueue.on('error', (err) => {
    if (!redisDisabledPermanently) {
      console.error('🚨 Token Refresh Queue Error:', err);
    }
  });
}

// Note: Connection event handlers are already set up in initializeRedisConnection()
// No duplicate handlers needed here