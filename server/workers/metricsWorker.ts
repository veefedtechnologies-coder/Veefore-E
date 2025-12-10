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
// Removed User and Workspace imports - using mongodb-storage directly

export class MetricsWorker {
  private static metricsWorker: Worker;
  private static webhookWorker: Worker;
  private static tokenRefreshWorker: Worker;

  /**
   * Start all workers
   */
  static start(): void {
    console.log('🚀 Starting Instagram metrics workers...');

    // Check if Redis is available
    if (!isRedisAvailable() || !redisConnection) {
      console.log('⚠️ Redis unavailable, workers will not start. Using fallback polling system.');
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
          connection: redisConnection,
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
          connection: redisConnection,
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
          connection: redisConnection,
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
    
    console.log(`📊 Processing metrics fetch: workspace=${workspaceId}, account=${instagramAccountId}, type=${metricsType}`);

    try {
      // Check if we need to fetch (unless force refresh)
      if (!forceRefresh) {
        const existingMetrics = await this.getLatestMetrics(workspaceId, instagramAccountId);
        if (existingMetrics && this.isMetricsFresh(existingMetrics, metricsType)) {
          console.log(`⚡ Using cached metrics for ${instagramAccountId} (type: ${metricsType})`);
          return { status: 'cached', metrics: existingMetrics };
        }
      }

      // Get token from token manager (handles rotation)
      const tokenInfo = await TokenManager.getWorkspaceToken(workspaceId);
      if (!tokenInfo) {
        throw new Error(`No available tokens for workspace ${workspaceId}`);
      }

      // Fetch metrics from Instagram API
      const metricsData = await this.fetchMetricsFromInstagram(
        tokenInfo.token,
        instagramAccountId,
        metricsType
      );

      // Save metrics to database
      const savedMetrics = await this.saveMetricsToDatabase(
        workspaceId,
        instagramAccountId,
        tokenInfo.instagramUsername,
        metricsData,
        metricsType
      );

      // Emit real-time update (this will be handled by realtime service)
      await this.emitMetricsUpdate(workspaceId, savedMetrics);

      console.log(`✅ Successfully processed metrics for ${instagramAccountId} (type: ${metricsType})`);
      return { status: 'success', metrics: savedMetrics };

    } catch (error) {
      console.error(`🚨 Error processing metrics job:`, error);

      // Handle rate limiting
      if (error instanceof Error && (error as any).is_rate_limit) {
        const rateLimitError = error as unknown as InstagramApiError;
        await TokenManager.handleRateLimit(workspaceId, token, rateLimitError.retry_after || 3600);
        
        // Retry the job later
        throw new Error(`Rate limited. Retrying after ${rateLimitError.retry_after || 3600} seconds`);
      }

      // Handle token expiration
      if (error instanceof Error && error.message.includes('token')) {
        console.log(`🔄 Token may be expired for user ${userId}, scheduling refresh`);
        await TokenManager.refreshToken(userId, workspaceId);
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
          await this.processMediaUpdateWebhook(workspaceId, instagramAccountId, webhookData);
          break;
        
        default:
          console.log(`⚠️ Unknown webhook event type: ${eventType}`);
      }

      // Trigger immediate metrics refresh for the affected account
      const tokenInfo = await TokenManager.getWorkspaceToken(workspaceId);
      if (tokenInfo && metricsQueue) {
        await metricsQueue.add('fetch-metrics' as any, {
          workspaceId,
          userId: tokenInfo.userId,
          instagramAccountId,
          token: tokenInfo.token,
          metricsType: 'all',
          forceRefresh: true,
        }, {
          priority: 1, // Highest priority
          delay: 5000, // 5 second delay to allow Instagram to process
        });
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
   * Fetch metrics from Instagram API based on type
   */
  private static async fetchMetricsFromInstagram(
    token: string,
    instagramAccountId: string,
    metricsType: string
  ): Promise<any> {
    switch (metricsType) {
      case 'all':
        return InstagramApiService.getComprehensiveMetrics(token, instagramAccountId);
      
      case 'followers':
        return InstagramApiService.getAccountInfo(token);
      
      case 'likes':
      case 'comments':
        return InstagramApiService.getRecentMediaWithInsights(token, 7);
      
      case 'reach':
      case 'impressions':
        return InstagramApiService.getAccountInsights(instagramAccountId, token, 'day');
      
      default:
        return InstagramApiService.getComprehensiveMetrics(token, instagramAccountId);
    }
  }

  /**
   * Save metrics to database with delta detection
   */
  private static async saveMetricsToDatabase(
    workspaceId: string,
    instagramAccountId: string,
    instagramUsername: string,
    metricsData: any,
    metricsType: string
  ): Promise<IMetrics> {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    // Get existing metrics for comparison (delta detection)
    const existingMetrics = await Metrics.findOne({
      workspaceId,
      instagramAccountId,
      period: 'day',
      startDate: { $gte: startOfDay },
      endDate: { $lt: endOfDay }
    });

    // Prepare metrics data based on type
    let metricsToSave: Partial<IMetrics> = {
      workspaceId,
      instagramAccountId,
      instagramUsername,
      period: 'day',
      startDate: startOfDay,
      endDate: endOfDay,
      lastUpdated: now,
      fetchedAt: now,
      source: 'api',
      dataStatus: 'fresh',
    };

    // Extract metrics based on data structure
    if (metricsData.account) {
      // Comprehensive metrics
      const { account, insights, aggregated } = metricsData;
      
      metricsToSave = {
        ...metricsToSave,
        followers: account.followers_count,
        following: account.follows_count,
        mediaCount: account.media_count,
        likes: aggregated.totalLikes,
        comments: aggregated.totalComments,
        shares: aggregated.totalShares,
        saves: aggregated.totalSaves,
        reach: aggregated.totalReach || insights.reach || 0,
        impressions: aggregated.totalImpressions || insights.impressions || 0,
        profileViews: insights.profile_views || 0,
        websiteClicks: insights.website_clicks || 0,
        engagementRate: aggregated.averageEngagementRate,
      };
    } else if (Array.isArray(metricsData)) {
      // Media data
      const totalLikes = metricsData.reduce((sum, media) => sum + (media.like_count || 0), 0);
      const totalComments = metricsData.reduce((sum, media) => sum + (media.comments_count || 0), 0);
      
      metricsToSave.likes = totalLikes;
      metricsToSave.comments = totalComments;
    } else if (metricsData.followers_count !== undefined) {
      // Account info
      metricsToSave.followers = metricsData.followers_count;
      metricsToSave.following = metricsData.follows_count;
      metricsToSave.mediaCount = metricsData.media_count;
    }

    // Calculate changes since last update
    if (existingMetrics) {
      metricsToSave.previousValues = {
        followers: existingMetrics.followers,
        likes: existingMetrics.likes,
        comments: existingMetrics.comments,
        reach: existingMetrics.reach,
        impressions: existingMetrics.impressions,
        engagementRate: existingMetrics.engagementRate,
      };

      metricsToSave.changesSince = {
        followers: (metricsToSave.followers || 0) - (existingMetrics.followers || 0),
        likes: (metricsToSave.likes || 0) - (existingMetrics.likes || 0),
        comments: (metricsToSave.comments || 0) - (existingMetrics.comments || 0),
        reach: (metricsToSave.reach || 0) - (existingMetrics.reach || 0),
        impressions: (metricsToSave.impressions || 0) - (existingMetrics.impressions || 0),
        engagementRate: (metricsToSave.engagementRate || 0) - (existingMetrics.engagementRate || 0),
      };
    }

    // Calculate derived metrics
    if (metricsToSave.followers && metricsToSave.mediaCount) {
      metricsToSave.averageLikesPerPost = (metricsToSave.likes || 0) / metricsToSave.mediaCount;
      metricsToSave.averageCommentsPerPost = (metricsToSave.comments || 0) / metricsToSave.mediaCount;
    }

    if (metricsToSave.reach && metricsToSave.followers) {
      metricsToSave.reachRate = (metricsToSave.reach / metricsToSave.followers) * 100;
    }

    // Save or update metrics
    const savedMetrics = await Metrics.findOneAndUpdate(
      {
        workspaceId,
        instagramAccountId,
        period: 'day',
        startDate: { $gte: startOfDay },
        endDate: { $lt: endOfDay }
      },
      metricsToSave,
      { upsert: true, new: true }
    );

    return savedMetrics;
  }

  /**
   * Check if metrics are fresh enough to skip fetching
   */
  private static isMetricsFresh(metrics: IMetrics, metricsType: string): boolean {
    const now = new Date();
    const ageInMinutes = (now.getTime() - metrics.lastUpdated.getTime()) / (1000 * 60);

    // Smart polling intervals based on metric type
    const freshnessTresholds = {
      followers: 60,    // 1 hour for stable metrics
      likes: 15,        // 15 minutes for dynamic metrics
      comments: 10,     // 10 minutes for dynamic metrics
      reach: 30,        // 30 minutes
      impressions: 45,  // 45 minutes
      all: 20,          // 20 minutes for comprehensive
    };

    const threshold = freshnessTresholds[metricsType as keyof typeof freshnessTresholds] || 20;
    return ageInMinutes < threshold;
  }

  /**
   * Get latest metrics for an account
   */
  private static async getLatestMetrics(workspaceId: string, instagramAccountId: string): Promise<IMetrics | null> {
    return Metrics.findOne({
      workspaceId,
      instagramAccountId,
    }).sort({ lastUpdated: -1 });
  }

  /**
   * Emit metrics update via WebSocket (placeholder - will be implemented in realtime service)
   */
  private static async emitMetricsUpdate(workspaceId: string, metrics: IMetrics): Promise<void> {
    // This will be implemented when we create the realtime service
    console.log(`📡 Emitting metrics update for workspace ${workspaceId}`);
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