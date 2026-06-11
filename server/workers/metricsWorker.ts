import { Worker, Job } from 'bullmq';
import {
  metricsQueue,
  webhookQueue,
  tokenRefreshQueue,
  FetchMetricsJobData,
  WebhookProcessJobData,
  TokenRefreshJobData,
  redisConnection,
  isRedisAvailable
} from '../queues/metricsQueue';
import InstagramApiService, { InstagramApiError } from '../services/instagramApi';
import TokenManager from '../services/tokenManager';
import Metrics, { IMetrics } from '../models/Metrics';
import IORedis from 'ioredis';
import { getRedisOptions } from '../lib/redis';

export class MetricsWorker {
  private static metricsWorker: Worker;
  private static webhookWorker: Worker;
  private static tokenRefreshWorker: Worker;

  /**
   * Start all workers
   */
  static async start(): Promise<void> {
    console.log('🚀 Starting Instagram metrics workers...');

    if (!redisConnection) {
      console.log('⚠️ Redis connection undefined, workers will not start. Using fallback polling system.');
      return;
    }

    try {
      // Metrics fetch worker
      this.metricsWorker = new Worker(
        'metrics-fetch',
        async (job: Job<FetchMetricsJobData>) => {
          return this.processMetricsFetchJob(job);
        },
        {
          connection: new IORedis(process.env.REDIS_URL!, { ...getRedisOptions(process.env.REDIS_URL!), maxRetriesPerRequest: null }),
          concurrency: 5, // Process 5 jobs concurrently
          removeOnComplete: { count: 100 },
          removeOnFail: { count: 50 },
        }
      );

      // Webhook processing worker
      this.webhookWorker = new Worker(
        'webhook-process',
        async (job: Job<WebhookProcessJobData>) => {
          return this.processWebhookJob(job);
        },
        {
          connection: new IORedis(process.env.REDIS_URL!, { ...getRedisOptions(process.env.REDIS_URL!), maxRetriesPerRequest: null }),
          concurrency: 10, // High concurrency for real-time webhooks
          removeOnComplete: { count: 50 },
          removeOnFail: { count: 25 },
        }
      );

      // Token refresh worker
      this.tokenRefreshWorker = new Worker(
        'token-refresh',
        async (job: Job<TokenRefreshJobData>) => {
          return this.processTokenRefreshJob(job);
        },
        {
          connection: new IORedis(process.env.REDIS_URL!, { ...getRedisOptions(process.env.REDIS_URL!), maxRetriesPerRequest: null }),
          concurrency: 2, // Lower concurrency for token operations
          removeOnComplete: { count: 25 },
          removeOnFail: { count: 10 },
        }
      );

      // Set up event handlers
      this.setupEventHandlers();

      console.log('✅ All Instagram metrics workers started successfully');
    } catch (error) {
      console.error('🚨 Failed to start workers:', error);
      console.log('⚠️ Falling back to existing polling system');
    }
  }

  /**
   * Stop all workers
   */
  static async stop(): Promise<void> {
    console.log('🛑 Stopping Instagram metrics workers...');

    try {
      await Promise.all([
        this.metricsWorker?.close(),
        this.webhookWorker?.close(),
        this.tokenRefreshWorker?.close(),
      ]);

      console.log('✅ All workers stopped');
    } catch (error) {
      console.error('🚨 Error stopping workers:', error);
    }
  }

  /**
   * Process metrics fetch job
   */
  private static async processMetricsFetchJob(job: Job<FetchMetricsJobData>): Promise<any> {
    const { workspaceId, userId, instagramAccountId, token, metricsType, forceRefresh } = job.data;
    const isDailySnapshot = job.name === 'daily-snapshot' || (metricsType as any) === 'daily-snapshot' || (job.data as any).type === 'daily-snapshot';
    const isTokenHygieneRefresh = job.name === 'token-hygiene-refresh' || (job.data as any).type === 'token-hygiene-refresh';
    const isTokenHygieneCleanup = job.name === 'token-hygiene-cleanup' || (job.data as any).type === 'token-hygiene-cleanup';
    const isSocialListeningTrends = job.name === 'social-listening-trends' || (job.data as any).type === 'social-listening-trends';
    const isDeepHibernationCleanup = job.name === 'deep-hibernation-cleanup' || (job.data as any).type === 'deep-hibernation-cleanup';
    
    // Check if this is a system job that doesn't require instagramAccountId
    const isSystemJob = isDailySnapshot || isTokenHygieneRefresh || isTokenHygieneCleanup || 
                        isSocialListeningTrends || isDeepHibernationCleanup;
    
    console.log(`📊 Processing metrics fetch: name=${job.name}, workspace=${workspaceId || 'N/A'}, account=${instagramAccountId || 'N/A'}, systemJob=${isSystemJob}`);

    try {
      // PHASE 4: Global Daily Snapshot Job Intercept
        if (isDailySnapshot) {
          console.log(`[BULLMQ] 📸 Running global daily snapshot job`);
          const { analyticsService } = await import('../services');
          const { workspaceRepository, socialAccountRepository } = await import('../repositories');
          const { InstagramApiService } = await import('../services/instagramApi');
          const { InstagramFollowerSnapshotModel } = await import('../models/Analytics');
          const { getAccessTokenFromAccount } = await import('../storage/converters');
          
          const workspaces = await workspaceRepository.findAll();
          let successCount = 0;
          let failCount = 0;
  
          for (const workspace of workspaces) {
            try {
              const workspaceId = (workspace._id as any).toString();
              await analyticsService.generateDailySnapshot(workspaceId, 'instagram');
              
              // Now also run true follower snapshot sync via API
              const accounts = await socialAccountRepository.findActiveByWorkspace(workspaceId);
              for (const account of accounts) {
                if (account.platform === 'instagram' && account.accountId) {
                  try {
                    const token = getAccessTokenFromAccount(account);
                    if (!token) continue;
                    
                    // forceRefresh=true: daily snapshots must use real counts, not cached values
                    const igInfo = await InstagramApiService.getAccountInfo(token, account.accountId, true);
                    if (igInfo && typeof igInfo.followers_count === 'number') {
                      const today = new Date();
                      today.setUTCHours(0, 0, 0, 0);
                      
                      await InstagramFollowerSnapshotModel.findOneAndUpdate(
                        { 
                          accountId: account._id, 
                          instagramUserId: account.accountId,
                          snapshotDate: today
                        },
                        {
                          followerCount: igInfo.followers_count,
                        },
                        { upsert: true, new: true }
                      );
                      console.log(`[BULLMQ] 📸 Logged follower snapshot for account ${account.accountId}: ${igInfo.followers_count} followers`);
                    }
                  } catch (snapshotErr: any) {
                     console.error(`[BULLMQ] ❌ Failed to fetch follower snapshot for account ${account._id}:`, snapshotErr.message);
                  }
                }
              }

              successCount++;
            } catch (error) {
              failCount++;
            }
          }
          console.log(`[BULLMQ] 📸 Daily snapshots completed. Success: ${successCount}, Failed: ${failCount}`);
          return { status: 'success', type: 'daily-snapshot', successCount, failCount };
        }
  
        // Handle Social Listening Trends Job
        if (isSocialListeningTrends) {
          console.log('[BULLMQ] 📈 Triggering Trend Engine for all workspaces...');
          const { ListeningSourceModel } = await import('../models/SocialListening/ListeningSource');
          const { TrendEngineService } = await import('../services/social-listening/trend-engine.service');
          
          const distinctWorkspaces = await ListeningSourceModel.distinct('workspaceId');
          for (const workspaceId of distinctWorkspaces) {
            if (workspaceId) {
              await TrendEngineService.calculateTrends(workspaceId.toString(), 24);
            }
          }
          console.log(`[BULLMQ] 📈 Finished processing trends for ${distinctWorkspaces.length} workspaces.`);
          return { status: 'success', type: 'social-listening-trends' };
        }

        // Handle token hygiene tasks directly
        if (isTokenHygieneRefresh) {
          console.log(`[BULLMQ] 🧹 Running global token hygiene refresh checks...`);
          const { TokenManager } = await import('../services/tokenManager');
          await TokenManager.scheduleTokenRefresh();
          return { status: 'success', type: 'token-hygiene-refresh' };
        }
  
        if (isTokenHygieneCleanup) {
          console.log(`[BULLMQ] 🧹 Running global token hygiene cleanup (rate limits)...`);
          const { TokenManager } = await import('../services/tokenManager');
          TokenManager.cleanupExpiredRateLimits();
          return { status: 'success', type: 'token-hygiene-cleanup' };
        }

        // ══════════════════════════════════════════════════════════════
        // DEEP HIBERNATION CLEANUP (Layer 2 defense-in-depth)
        // Runs daily at 2 AM. Scans all workspaces and physically removes
        // BullMQ repeatable jobs for any workspace inactive >30 days.
        // ══════════════════════════════════════════════════════════════
        if (isDeepHibernationCleanup) {
          console.log(`[DEEP HIBERNATION] 🌙 Starting daily deep hibernation cleanup scan...`);
          try {
            const { metricsQueue: mq } = await import('../queues/metricsQueue');
            const { workspaceRepository } = await import('../repositories');
            const DEEP_SLEEP_DAYS = 30;

            const allWorkspaces = await workspaceRepository.findAll();
            let removedCount = 0;
            let scannedCount = 0;

            for (const workspace of allWorkspaces) {
              scannedCount++;
              const lastActivity = (workspace as any).lastActivity
                ? new Date((workspace as any).lastActivity).getTime()
                : 0;
              const daysInactive = (Date.now() - lastActivity) / (1000 * 60 * 60 * 24);

              if (daysInactive > DEEP_SLEEP_DAYS) {
                const workspaceId = (workspace._id as any).toString();
                console.log(`[DEEP HIBERNATION] 💤 Workspace ${workspaceId} inactive ${daysInactive.toFixed(0)} days — removing all BullMQ jobs`);

                if (mq) {
                  try {
                    const repeatableJobs = await mq.getRepeatableJobs();
                    // Ensure exact workspace ID match by checking with delimiters to avoid substring matches
                    const workspaceJobs = repeatableJobs.filter(j => j.key.includes(`-${workspaceId}-`));
                    for (const rj of workspaceJobs) {
                      await mq.removeRepeatableByKey(rj.key);
                      removedCount++;
                    }
                    // Invalidate cache after removing jobs
                    if (workspaceJobs.length > 0) {
                      const { invalidateRepeatableJobsCache } = await import('../queues/metricsQueue');
                      invalidateRepeatableJobsCache();
                    }
                    // Also purge any waiting/delayed instances left over
                    const pendingJobs = await mq.getJobs(['waiting', 'delayed', 'prioritized']);
                    for (const pj of pendingJobs) {
                      if (pj.data.workspaceId === workspaceId && !pj.data.forceRefresh) {
                        await pj.remove();
                        removedCount++;
                      }
                    }
                  } catch (removeErr: any) {
                    console.error(`[DEEP HIBERNATION] Failed to remove jobs for workspace ${workspaceId}:`, removeErr.message);
                  }
                }
              }
            }

            console.log(`[DEEP HIBERNATION] ✅ Scan complete. Scanned ${scannedCount} workspaces, removed ${removedCount} stale BullMQ job entries.`);
            return { status: 'success', type: 'deep-hibernation-cleanup', scannedCount, removedCount };
          } catch (err: any) {
            console.error(`[DEEP HIBERNATION] ❌ Cleanup scan failed:`, err.message);
            return { status: 'error', type: 'deep-hibernation-cleanup', error: err.message };
          }
        }

      // Force refresh is now handled natively by SocialAccountService bypassing memory caching

      // ==========================================
      // SMART POLLING HIBERNATION CHECK
      // ==========================================
      if (workspaceId && !forceRefresh && metricsType !== 'all') {
        try {
          const { storage } = await import('../mongodb-storage');
          const workspace = await storage.getWorkspace(workspaceId);
          if (workspace && workspace.lastActivity) {
            const daysInactive = (Date.now() - new Date(workspace.lastActivity).getTime()) / (1000 * 60 * 60 * 24);
            if (daysInactive > 7) {
              console.log(`[HIBERNATION] 💤 Workspace ${workspaceId} has been inactive for ${daysInactive.toFixed(1)} days. Suspending active polling schedules.`);
              // Suspend polling by physically removing this specific job from the repeatable list
              if (job.repeatJobKey) {
                const { metricsQueue: mq, invalidateRepeatableJobsCache } = await import('../queues/metricsQueue');
                if (mq) {
                   await mq.removeRepeatableByKey(job.repeatJobKey);
                   invalidateRepeatableJobsCache();
                   console.log(`[HIBERNATION] 🗑️ Removed repeatable schedule ${job.repeatJobKey}`);
                }
              }
              return { status: 'suspended', reason: 'hibernation', daysInactive };
            }
          }
        } catch (err: any) {
          console.error(`[HIBERNATION] Failed to check workspace activity: ${err.message}`);
        }
      }

      console.log(`\n======================================================`);
      console.log(`[BULLMQ WORKER] 🚀 DELEGATING FETCH TO SOCIAL ACCOUNT SERVICE`);
      console.log(`[BULLMQ WORKER] Account ID: ${instagramAccountId}`);
      console.log(`======================================================\n`);
      
      // Guard against null or missing account IDs from regular jobs (not system jobs)
      if (!instagramAccountId || typeof instagramAccountId !== 'string') {
        throw new Error('Invalid or missing instagramAccountId in job data');
      }
      
      const { socialAccountService } = await import('../services/SocialAccountService');
      const { default: mongoose } = await import('mongoose');
      
      let targetAccountId = instagramAccountId;
      
      // If the provided ID is not a valid Mongo ObjectId (e.g. it is the external Instagram numerical ID)
      if (!mongoose.Types.ObjectId.isValid(instagramAccountId)) {
        console.log(`[BULLMQ WORKER] Resolving external ID ${instagramAccountId} to internal DB ID...`);
        const account = await socialAccountService.findByInstagramAccountId(instagramAccountId);
        if (account && account._id) {
          targetAccountId = account._id.toString();
          console.log(`[BULLMQ WORKER] Resolved to internal ID: ${targetAccountId}`);
        } else {
          // If we can't find it by instagramAccountId, it might be a tolerant lookup issue.
          // We will throw an error to fail the job gracefully rather than crashing the DB.
          throw new Error(`Could not resolve external Instagram ID ${instagramAccountId} to internal database record`);
        }
      }

      // Delegate targeted sync to SocialAccountService
      const savedMetrics = await socialAccountService.syncAccount(targetAccountId, {
        metricsType: metricsType as any,
        forceRefresh: forceRefresh
      });

      console.log(`✅ Successfully processed metrics for ${instagramAccountId} (type: ${metricsType || 'all'})`);
      return { status: 'success', metrics: savedMetrics };

    } catch (error: any) {
      const isTokenError = error instanceof Error && error.message.toLowerCase().includes('token');
      
      if (isTokenError) {
        // Clean logging for expected token expirations without scary stack traces
        console.log(`\n⚠️ [BULLMQ WORKER] Job failed due to token validation: ${error.message}`);
      } else {
        console.error(`🚨 Error processing metrics job:`, error);
      }

      // Handle rate limiting
      if (error instanceof Error && (error as any).is_rate_limit) {
        const rateLimitError = error as unknown as InstagramApiError;
        await TokenManager.handleRateLimit(workspaceId, token, rateLimitError.retry_after || 3600);

        // Retry the job later
        throw new Error(`Rate limited. Retrying after ${rateLimitError.retry_after || 3600} seconds`);
      }

      // Handle token expiration
      if (isTokenError) {
        console.log(`🔄 Token may be expired for user ${userId}, scheduling refresh`);
        const { default: mongoose } = await import('mongoose');
        if (mongoose.Types.ObjectId.isValid(userId)) {
          await TokenManager.refreshToken(userId, workspaceId);
        } else {
          console.log(`⚠️ Cannot auto-refresh token for system-scheduled job. The TokenManager background cron will handle workspace ${workspaceId} automatically.\n`);
        }
        
        // Throw a clean string instead of the Error object so BullMQ doesn't dump the massive stack trace in the terminal
        throw new Error(`Expected Failure: Token validation failed - ${error.message}`);
      }

      throw error;
    }
  }

  /**
   * Process webhook job
   */
  private static async processWebhookJob(job: Job<WebhookProcessJobData>): Promise<any> {
    const { workspaceId, instagramAccountId, webhookData, eventType } = job.data;

    console.log(`🔔 Processing webhook: workspace=${workspaceId}, account=${instagramAccountId}, event=${eventType}`);

    try {
      // Process different webhook event types
      switch (eventType) {
        case 'comments':
          await this.processCommentWebhook(workspaceId, instagramAccountId, webhookData);
          break;

        case 'mentions':
          await this.processMentionWebhook(workspaceId, instagramAccountId, webhookData);
          break;

        case 'story_insights':
          await this.processStoryInsightsWebhook(workspaceId, instagramAccountId, webhookData);
          break;

        case 'messages':
          await this.processMessageWebhook(workspaceId, instagramAccountId, webhookData);
          break;

        case 'media_updates':
          console.log(`📸 Media update detected for ${instagramAccountId}. Skipping targeted sync to prevent rate limit exhaustion.`);
          // const tokenInfo = await TokenManager.getWorkspaceToken(workspaceId);
          // if (tokenInfo && metricsQueue) {
          //   await metricsQueue.add('fetch-metrics' as any, {
          //     workspaceId,
          //     userId: tokenInfo.userId,
          //     instagramAccountId,
          //     token: tokenInfo.token,
          //     metricsType: 'all', // Best to do a full sync on new post to ensure state is consistent
          //     forceRefresh: true,
          //   }, {
          //     priority: 1, // Highest priority
          //     delay: 10000, // 10 second delay to allow Instagram graph edge to propagate
          //     jobId: `fetch-media-${instagramAccountId}-${webhookData.media_id || Date.now()}` // Deduplicate requests for the same media
          //   });
          // }
          break;

        default:
          console.log(`⚠️ Unknown webhook event type: ${eventType}`);
      }

      console.log(`✅ Successfully processed webhook for ${instagramAccountId} (event: ${eventType})`);
      return { status: 'success' };

    } catch (error) {
      console.error(`🚨 Error processing webhook job:`, error);
      throw error;
    }
  }

  /**
   * Process token refresh job
   */
  private static async processTokenRefreshJob(job: Job<TokenRefreshJobData>): Promise<any> {
    const { workspaceId, userId, refreshToken, instagramAccountId } = job.data;

    console.log(`🔄 Processing token refresh: workspace=${workspaceId}, user=${userId}`);

    try {
      const success = await TokenManager.refreshToken(userId, workspaceId);

      if (success) {
        console.log(`✅ Successfully refreshed token for user ${userId}`);
        return { status: 'success' };
      } else {
        console.log(`❌ Failed to refresh token for user ${userId}`);
        return { status: 'failed' };
      }

    } catch (error) {
      console.error(`🚨 Error refreshing token:`, error);
      throw error;
    }
  }

  

  

  

  

  

  /**
   * Process different webhook event types
   */
  private static async processCommentWebhook(workspaceId: string, instagramAccountId: string, data: any): Promise<void> {
    console.log(`💬 Processing comment webhook for ${instagramAccountId}`);
    // Implementation for comment events
  }

  private static async processMentionWebhook(workspaceId: string, instagramAccountId: string, data: any): Promise<void> {
    console.log(`@️ Processing mention webhook for ${instagramAccountId}`);
    // Implementation for mention events
  }

  private static async processStoryInsightsWebhook(workspaceId: string, instagramAccountId: string, data: any): Promise<void> {
    console.log(`📱 Processing story insights webhook for ${instagramAccountId}`);
    // Implementation for story insights
  }

  private static async processMessageWebhook(workspaceId: string, instagramAccountId: string, data: any): Promise<void> {
    console.log(`💌 Processing message webhook for ${instagramAccountId}`);
    // Implementation for direct messages
  }

  private static async processMediaUpdateWebhook(workspaceId: string, instagramAccountId: string, data: any): Promise<void> {
    console.log(`📸 Processing media update webhook for ${instagramAccountId}`);
    // Implementation for media updates
  }

  /**
   * Setup event handlers for workers
   */
  private static setupEventHandlers(): void {
    // Metrics worker events
    if (this.metricsWorker) {
      this.metricsWorker.on('completed', (job) => {
        console.log(`✅ Metrics job ${job.id} completed successfully`);
      });

      this.metricsWorker.on('failed', (job, err) => {
        console.error(`❌ Metrics job ${job?.id} failed:`, err);
      });

      this.metricsWorker.on('error', (err) => {
        console.error('🚨 Metrics worker error:', err);
      });
    }

    // Webhook worker events
    if (this.webhookWorker) {
      this.webhookWorker.on('completed', (job) => {
        console.log(`✅ Webhook job ${job.id} completed successfully`);
      });

      this.webhookWorker.on('failed', (job, err) => {
        console.error(`❌ Webhook job ${job?.id} failed:`, err);
      });

      this.webhookWorker.on('error', (err) => {
        console.error('🚨 Webhook worker error:', err);
      });
    }

    // Token refresh worker events
    if (this.tokenRefreshWorker) {
      this.tokenRefreshWorker.on('completed', (job) => {
        console.log(`✅ Token refresh job ${job.id} completed successfully`);
      });

      this.tokenRefreshWorker.on('failed', (job, err) => {
        console.error(`❌ Token refresh job ${job?.id} failed:`, err);
      });

      this.tokenRefreshWorker.on('error', (err) => {
        console.error('🚨 Token refresh worker error:', err);
      });
    }
  }
}

export default MetricsWorker;