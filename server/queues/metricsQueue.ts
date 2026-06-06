import { Queue, QueueOptions, RepeatOptions } from 'bullmq';
import IORedis from 'ioredis';
import { getRedisOptions } from '../lib/redis';

// Redis connection status tracking
let redisConnection: IORedis | null = null;
let redisAvailable = false;
let redisDisabledPermanently = false;

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

// Initialize Redis connection with graceful fallback
function initializeRedisConnection(): IORedis | null {
  // CRITICAL: Skip Redis entirely if no REDIS_URL is configured
  // This prevents constant retry spam when Redis isn't available
  if (!process.env.REDIS_URL) {
    console.log('ℹ️  Redis: No REDIS_URL configured, using in-memory fallback (no retries)');
    redisDisabledPermanently = true;
    return null;
  }

  // If already permanently disabled, don't try again
  if (redisDisabledPermanently) {
    return null;
  }

  try {
    console.log('🔧 Initializing Redis connection...');

    // Configuration for Upstash Redis with BullMQ compatibility
    const baseOptions = getRedisOptions(process.env.REDIS_URL);

    // Merge base options with BullMQ specifics
    const redisConfig = {
      ...baseOptions,
      maxRetriesPerRequest: null, // Required for BullMQ
      connectTimeout: 10000, 
      lazyConnect: true,
      enableReadyCheck: true,
      // Reconnect with exponential backoff to handle Upstash dropping idle connections
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 500, 15000);
        return delay;
      },
      reconnectOnError: () => true, // Reconnect on connection reset
    };

    // Create connection with URL and configuration
    const connection = new IORedis(process.env.REDIS_URL, redisConfig);
    console.log('✅ Redis connection created (lazy connect mode)');

    // Redis connection event handlers
    connection.on('connect', () => {
      console.log('🔗 Redis connected for job queues');
    });

    connection.on('ready', () => {
      console.log('✅ Redis: Connected and ready for operations');
      redisAvailable = true;
    });

    connection.on('error', (error: Error) => {
      // Log error but allow retryStrategy to handle reconnection
      console.warn('⚠️ Redis connection error:', error.message);
      redisAvailable = false;
    });

    connection.on('close', () => {
      console.log('🔌 Redis connection closed, will attempt to reconnect...');
      redisAvailable = false;
    });
    connection.on('reconnecting', () => {
      console.log('🔌 Redis: Reconnecting...');
    });

    return connection;
  } catch (error) {
    console.log('❌ Redis: Failed to initialize -', (error as Error).message);
    console.log('ℹ️  Redis: Permanently disabled, using in-memory fallback');
    redisDisabledPermanently = true;
    redisAvailable = false;
    return null;
  }
}

// Initialize Redis connection (single attempt)
redisConnection = initializeRedisConnection();

// Create connection configuration for BullMQ
function getRedisConnectionConfig() {
  const redisUrl = process.env.REDIS_URL || process.env.KV_URL || process.env.STORAGE_REDIS_URL;
  const baseOptions = getRedisOptions(redisUrl);

  return {
    ...baseOptions,
    maxRetriesPerRequest: null,
    connectTimeout: 5000,
    lazyConnect: true,
    retryDelayOnFailover: 2000,
  };
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
  metricsType: 'followers' | 'likes' | 'comments' | 'shares' | 'saves' | 'reach' | 'views' | 'stories' | 'profile_views' | 'all';
  priority?: number;
  forceRefresh?: boolean;
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

// Create queues with specific rate limits (only if Redis is available)
export const metricsQueue = redisConnection ? new Queue<FetchMetricsJobData>('metrics-fetch', queueOptions) : null;

export const webhookQueue = redisConnection ? new Queue<WebhookProcessJobData>('webhook-process', queueOptions) : null;

export const tokenRefreshQueue = redisConnection ? new Queue<TokenRefreshJobData>('token-refresh', queueOptions) : null;

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

export const POLLING_INTERVALS = {
  all: 80, // 80 minutes - Consolidated smart polling for all media & insights
} as const;

// Queue management functions
export class MetricsQueueManager {

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
   * Schedule metrics fetch job for a workspace
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
      delay: options.delay || 0,
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
   * Schedule smart polling jobs with adaptive intervals
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

    const activityMultiplier = {
      high: 0.5, // Poll more frequently for active accounts
      medium: 1,
      low: 2, // Poll less frequently for inactive accounts
    };

    const multiplier = activityMultiplier[accountActivity];

    try {
      // Calculate the intended new job IDs based on the current multiplier
      const newSchedules = Object.entries(POLLING_INTERVALS).map(([metricType, baseIntervalMinutes]) => {
        const repeatMs = Math.floor(baseIntervalMinutes * multiplier * 60 * 1000);
        return {
          metricType,
          repeatMs,
          jobId: `smart-poll-${workspaceId}-${instagramAccountId}-${metricType}-${repeatMs}`
        };
      });

      try {
        const repeatableJobs = await metricsQueue.getRepeatableJobs();
        const existingJobs = repeatableJobs.filter(j => 
          j.key.includes(`smart-poll-${workspaceId}-${instagramAccountId}-`)
        );
        
        // Remove any jobs that don't match our intended new job IDs
        for (const job of existingJobs) {
          // BullMQ stores our custom key in the `key` property when using `repeat: { key }`
          if (!newSchedules.find(s => job.key === s.jobId)) {
             await metricsQueue.removeRepeatableByKey(job.key);
          }
        }

        // Add the jobs (Only add if they don't already exist to guarantee we don't reset timers)
        for (const schedule of newSchedules) {
          const { metricType, repeatMs, jobId } = schedule;
          
          const exists = existingJobs.find(j => j.key === jobId);
          if (!exists) {
            await metricsQueue.add(
              'fetch-metrics' as any,
              {
                workspaceId,
                userId,
                instagramAccountId,
                token,
                metricsType: metricType as FetchMetricsJobData['metricsType'],
                priority: JOB_PRIORITIES.SMART_POLLING_STABLE,
              },
              {
                repeat: { every: repeatMs, key: jobId } as any,
                priority: JOB_PRIORITIES.SMART_POLLING_STABLE,
                jobId: jobId, // The jobId uniquely identifies the repeatable job
              }
            );
          }
        }
      } catch (e) {
        console.error(`🚨 Failed to sync existing smart polling schedules:`, e);
      }

      console.log(`🔄 Scheduled granular smart polling for workspace ${workspaceId}, account ${instagramAccountId}, activity: ${accountActivity} (Multiplier: ${multiplier})`);
    } catch (error) {
      console.error(`🚨 Failed to schedule smart polling:`, error);
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
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        metricsQueue.getWaiting(),
        metricsQueue.getActive(),
        metricsQueue.getCompleted(),
        metricsQueue.getFailed(),
        metricsQueue.getDelayed(),
      ]);

      return {
        metricsQueue: {
          waiting: waiting.length,
          active: active.length,
          completed: completed.length,
          failed: failed.length,
          delayed: delayed.length,
        },
        webhookQueue: {
          waiting: (await webhookQueue.getWaiting()).length,
          active: (await webhookQueue.getActive()).length,
          completed: (await webhookQueue.getCompleted()).length,
          failed: (await webhookQueue.getFailed()).length,
        },
        tokenRefreshQueue: {
          waiting: (await tokenRefreshQueue.getWaiting()).length,
          active: (await tokenRefreshQueue.getActive()).length,
          completed: (await tokenRefreshQueue.getCompleted()).length,
          failed: (await tokenRefreshQueue.getFailed()).length,
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