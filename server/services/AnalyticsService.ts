import { BaseService } from './BaseService';
import { analyticsRepository } from '../repositories/AnalyticsRepository';
import { socialAccountRepository } from '../repositories/SocialAccountRepository';
import { getAccessTokenFromAccount } from '../storage/converters';
import { ContentModel } from '../models/Content/Content';
import { IAnalytics } from '../models/Analytics';
import { NotFoundError, ValidationError } from '../errors';

interface RecordMetricsInput {
  workspaceId: string;
  accountId?: string;
  platform: string;
  date?: Date;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  followers?: number;
  posts?: number;
  engagement?: number;
  reach?: number;
  reachDay?: number;
  reachWeek?: number;
  reachDays28?: number;
  customMetrics?: Record<string, any>;
  audienceCity?: Record<string, number>;
  audienceCountry?: Record<string, number>;
  audienceGenderAge?: Record<string, number>;
  audienceActiveTime?: Record<string, number>;
}

interface DateRangeQuery {
  workspaceId: string;
  startDate: Date;
  endDate: Date;
  platform?: string;
  platforms?: string[];
  accountIds?: string[];
}

export class AnalyticsService extends BaseService {
  constructor() {
    super('AnalyticsService');
  }

  async getAnalyticsById(analyticsId: string): Promise<IAnalytics> {
    return this.withErrorHandling('getAnalyticsById', async () => {
      const analytics = await analyticsRepository.findById(analyticsId);
      if (!analytics) {
        throw new NotFoundError('Analytics', analyticsId);
      }
      return analytics;
    });
  }

  async getAnalyticsByWorkspace(
    workspaceId: string,
    page: number = 1,
    limit: number = 30
  ) {
    return this.withErrorHandling('getAnalyticsByWorkspace', async () => {
      return analyticsRepository.findByWorkspaceId(workspaceId, { page, limit });
    });
  }

  async getAnalyticsByPlatform(
    workspaceId: string,
    platform: string,
    page: number = 1,
    limit: number = 30
  ) {
    return this.withErrorHandling('getAnalyticsByPlatform', async () => {
      return analyticsRepository.findByWorkspaceAndPlatform(workspaceId, platform, { page, limit });
    });
  }

  async getPlatformMetrics(workspaceId: string) {
    return this.withErrorHandling('getPlatformMetrics', async () => {
      return analyticsRepository.getPlatformSummary(workspaceId);
    });
  }

  async getLatestAnalytics(workspaceId: string): Promise<IAnalytics | null> {
    return this.withErrorHandling('getLatestAnalytics', async () => {
      return analyticsRepository.findLatestByWorkspace(workspaceId);
    });
  }

  async getLatestByPlatform(workspaceId: string, platform: string): Promise<IAnalytics | null> {
    return this.withErrorHandling('getLatestByPlatform', async () => {
      return analyticsRepository.findLatestByPlatform(workspaceId, platform);
    });
  }

  async recordMetrics(input: RecordMetricsInput): Promise<IAnalytics> {
    return this.withErrorHandling('recordMetrics', async () => {
      const date = input.date || new Date();

      const analytics = await analyticsRepository.getOrCreateForDate(
        input.workspaceId,
        input.platform,
        date,
        input.accountId
      );

      // Determine the start-of-day baseline for followers.
      // We only need to calculate this if the record was just created (followers === 0).
      // Once set, we NEVER overwrite it — it is the "reference point" for the day.
      let baselineFollowers = analytics.followers; // existing baseline (>0 means already set)
      let baselinePosts = analytics.posts;

      if (analytics.followers === 0) {
        // Brand new record for this day — set baseline from yesterday's final record
        const startOfDay = new Date(date);
        startOfDay.setUTCHours(0, 0, 0, 0);

        const priorRecord = await analyticsRepository.findOneBeforeDate(
          input.workspaceId,
          startOfDay,
          input.platform,
          input.accountId
        );

        const MAX_GAP_MS = 2 * 24 * 60 * 60 * 1000; // 48 hours
        const isRecent = priorRecord && (startOfDay.getTime() - new Date(priorRecord.date).getTime() <= MAX_GAP_MS);

        if (isRecent && priorRecord.followers > 0) {
          // Use prior day's follower count as the start-of-day baseline
          baselineFollowers = priorRecord.followers;
          this.log('recordMetrics', 'New day — inheriting prior-day follower baseline', {
            workspaceId: input.workspaceId,
            platform: input.platform,
            priorFollowers: priorRecord.followers,
            liveFollowers: input.followers
          });
        } else {
          // No prior record or gap is too large. Use live count as baseline to reset growth tracking.
          baselineFollowers = input.followers || 0;
          if (priorRecord) {
            this.log('recordMetrics', 'Gap too large — resetting baseline to live data', {
              workspaceId: input.workspaceId,
              platform: input.platform
            });
          }
        }

        if (analytics.posts === 0 && isRecent && priorRecord.posts > 0) {
          baselinePosts = priorRecord.posts;
        } else {
          baselinePosts = input.posts || 0;
        }
      }

      const updated = await analyticsRepository.updateMetrics((analytics._id as any).toString(), {
        // Always update engagement metrics — these are live/cumulative values
        views: input.views,
        likes: input.likes,
        comments: input.comments,
        shares: input.shares,
        reach: input.reach || analytics.reach,
        reachDay: input.reachDay,
        reachWeek: input.reachWeek,
        reachDays28: input.reachDays28,
        engagement: input.engagement || analytics.engagement,
        // Followers and posts are START-OF-DAY baselines — only set on first sync of the day
        followers: baselineFollowers,
        posts: baselinePosts,
        customMetrics: input.customMetrics,
        audienceCity: input.audienceCity,
        audienceCountry: input.audienceCountry,
        audienceGenderAge: input.audienceGenderAge,
        audienceActiveTime: input.audienceActiveTime
      });

      if (!updated) {
        throw new Error('Failed to update analytics');
      }

      this.log('recordMetrics', 'Metrics recorded', {
        workspaceId: input.workspaceId,
        platform: input.platform,
        date,
        baselineFollowers,
        liveFollowers: input.followers
      });
      return updated;
    });
  }


  async incrementMetrics(
    workspaceId: string,
    platform: string,
    increments: {
      views?: number;
      likes?: number;
      comments?: number;
      shares?: number;
      reach?: number;
    }
  ): Promise<IAnalytics> {
    return this.withErrorHandling('incrementMetrics', async () => {
      const analytics = await analyticsRepository.getOrCreateForDate(
        workspaceId,
        platform,
        new Date()
      );

      const updated = await analyticsRepository.incrementMetrics(
        (analytics._id as any).toString(),
        increments
      );

      if (!updated) {
        throw new Error('Failed to increment metrics');
      }

      return updated;
    });
  }

  async generateDailySnapshot(workspaceId: string, platform: string = 'instagram'): Promise<IAnalytics | null> {
    return this.withErrorHandling('generateDailySnapshot', async () => {
      // 1. Get social account to fetch latest data
      // Use findOne to get specific account
      const account = await socialAccountRepository.findOne({
        workspaceId,
        platform
      });

      // Decrypt token to check validity (optional for snapshot, critical for sync)
      const token = account ? getAccessTokenFromAccount(account) : null;

      if (!account) {
        this.log('generateDailySnapshot', `No ${platform} account found for workspace ${workspaceId}`);
        return null;
      }

      if (!token) {
        this.log('generateDailySnapshot', `Warning: Generating snapshot with invalid/missing token for ${platform} account ${account._id}`);
        // We continue because we can still snapshot the existing DB metrics
      }

      // 2. Fetch latest metrics from Instagram
      // Note: In a real implementation, this would call the Instagram API directly
      // For now, we use the stored account data which should be kept up-to-date by other processes
      // OR we can trigger an untracked sync here if needed

      // 3. Update using recordMetrics which has all the baseline-protection logic built-in
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      const updated = await this.recordMetrics({
        workspaceId,
        accountId: account.accountId || account._id.toString(),
        platform,
        followers: account.followersCount || 0,
        posts: account.mediaCount || 0,
        likes: account.totalLikes || 0,
        comments: account.totalComments || 0,
        shares: account.totalShares || 0,
        engagement: account.avgEngagement || 0,
        reach: account.totalReach || 0,
        audienceCity: account.audienceCity,
        audienceCountry: account.audienceCountry,
        audienceGenderAge: account.audienceGenderAge,
        audienceActiveTime: account.audienceActiveTime,
        date: today
      });

      this.log('generateDailySnapshot', `Generated daily snapshot for ${platform}`, {
        workspaceId,
        followers: updated.followers
      });

      return updated;
    });
  }

  async getAnalyticsByDateRange(query: DateRangeQuery): Promise<IAnalytics[]> {
    return this.withErrorHandling('getAnalyticsByDateRange', async () => {
      if (query.startDate > query.endDate) {
        throw new ValidationError('Start date must be before end date');
      }

      // Enforce active account visibility
      const activeAccounts = await socialAccountRepository.findActiveByWorkspace(query.workspaceId);
      const activePlatforms = activeAccounts.map(a => a.platform);

      // If specific platform requested
      if (query.platform) {
        if (!activePlatforms.includes(query.platform as any)) {
          return []; // Platform inactive
        }
      } else {
        if (activePlatforms.length === 0) {
          return []; // No active platforms
        }
      }

      const platformsToQuery = query.platform ? [query.platform] : activePlatforms;
      const accountIdsToQuery = query.accountIds ? query.accountIds : activeAccounts.map(a => a.accountId || a._id.toString());

      return analyticsRepository.findByWorkspaceAndDateRange(
        query.workspaceId,
        query.startDate,
        query.endDate,
        platformsToQuery,
        accountIdsToQuery
      );
    });
  }

  async getAggregatedMetrics(query: DateRangeQuery) {
    return this.withErrorHandling('getAggregatedMetrics', async () => {
      if (query.startDate > query.endDate) {
        throw new ValidationError('Start date must be before end date');
      }

      // Enforce active account visibility
      const activeAccounts = await socialAccountRepository.findActiveByWorkspace(query.workspaceId);
      const activePlatforms = activeAccounts.map(a => a.platform);

      // If specific platform requested
      if (query.platform) {
        if (!activePlatforms.includes(query.platform as any)) {
          // Requested platform is not active -> return zeros
          return {
            totalViews: 0, totalLikes: 0, totalComments: 0, totalShares: 0,
            avgEngagement: 0, totalReach: 0, latestFollowers: 0,
            startFollowers: 0, totalPosts: 0
          };
        }
      } else {
        // No platform requested? Filter by ALL active platforms
        // If no active platforms, return zeros
        if (activePlatforms.length === 0) {
          return {
            totalViews: 0, totalLikes: 0, totalComments: 0, totalShares: 0,
            avgEngagement: 0, totalReach: 0, latestFollowers: 0,
            startFollowers: 0, totalPosts: 0
          };
        }
      }

      // Pass active platforms to repo to filter out disconnected data
      const platformsToQuery = query.platform ? [query.platform] : activePlatforms;

      return analyticsRepository.getAggregatedMetrics(
        query.workspaceId,
        query.startDate,
        query.endDate,
        platformsToQuery
      );
    });
  }

  async getDailyMetrics(query: DateRangeQuery) {
    return this.withErrorHandling('getDailyMetrics', async () => {
      if (query.startDate > query.endDate) {
        throw new ValidationError('Start date must be before end date');
      }

      // Enforce active account visibility
      const activeAccounts = await socialAccountRepository.findActiveByWorkspace(query.workspaceId);
      const activePlatforms = activeAccounts.map(a => a.platform);

      // If specific platform requested
      if (query.platform) {
        if (!activePlatforms.includes(query.platform as any)) {
          return []; // Platform inactive
        }
      } else {
        if (activePlatforms.length === 0) {
          return []; // No active platforms
        }
      }

      const platformsToQuery = query.platform ? [query.platform] : activePlatforms;

      return analyticsRepository.getDailyMetrics(
        query.workspaceId,
        query.startDate,
        query.endDate,
        platformsToQuery
      );
    });
  }

  async getGrowthRate(workspaceId: string, platform: string, days: number = 30) {
    return this.withErrorHandling('getGrowthRate', async () => {
      if (days <= 0) {
        throw new ValidationError('Days must be positive');
      }
      return analyticsRepository.getGrowthRate(workspaceId, platform, days);
    });
  }

  async getPerformanceSummary(workspaceId: string, days: number = 30): Promise<{
    overview: {
      totalViews: number;
      totalLikes: number;
      totalComments: number;
      totalShares: number;
      avgEngagement: number;
      totalReach: number;
      latestFollowers: number;
      totalFollowers: number;
      followerGains: number;
      followerLosses: number;
    };
    // Top-level fields for mobile app (matching AnalyticsMetrics interface)
    reach: number;
    followers: number;
    growthDelta: number;
    engagement: number;
    posts: number;
    period: string;
    growthRate?: {
      followers: number;
      reach: number;
      engagement: number;
    };
    growth: {
      followerGrowth: number;
      engagementGrowth: number;
      viewsGrowth: number;
    } | null;
    dailyMetrics: Array<{
      date: Date;
      views: number;
      likes: number;
      comments: number;
      shares: number;
      engagement: number;
      reach: number;
      followers: number;
    }>;
    audience?: {
      city?: Record<string, number>;
      country?: Record<string, number>;
      genderAge?: Record<string, number>;
      activeTime?: Record<string, number>;
      aiBestActiveTime?: any;
    };
  }> {
    return this.withErrorHandling('getPerformanceSummary', async () => {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // 1. Get ACTIVE accounts only (Disconnected accounts should be hidden)
      const accounts = await socialAccountRepository.findActiveByWorkspace(workspaceId);

      // If no active accounts, return empty state immediately
      if (!accounts || accounts.length === 0) {
        return {
          overview: {
            totalViews: 0,
            totalLikes: 0,
            totalComments: 0,
            totalShares: 0,
            avgEngagement: 0,
            totalReach: 0,
            latestFollowers: 0,
            totalFollowers: 0,
            followerGains: 0,
            followerLosses: 0,
            startFollowers: 0,
            totalPosts: 0,
            totalPostsSnapshot: 0,
            engagementSnapshot: 0
          },
          reach: 0,
          followers: 0,
          growthDelta: 0,
          engagement: 0,
          posts: 0,
          period: `${days}D`,
          dailyMetrics: [],
          growth: null
        };
      }

      const activePlatforms = accounts.map(a => a.platform);

      const [overview, dailyMetrics] = await Promise.all([
        this.getAggregatedMetrics({ workspaceId, startDate, endDate, platforms: activePlatforms }),
        this.getDailyMetrics({ workspaceId, startDate, endDate, platforms: activePlatforms })
      ]);

      let growth = null;
      let audience: any = undefined;

      let latestAnalytics: IAnalytics | null = null;
      try {
        latestAnalytics = await analyticsRepository.findLatestByWorkspace(workspaceId);
        if (latestAnalytics) {
          growth = await this.getGrowthRate(workspaceId, latestAnalytics.platform, days);

          // Populate audience data from latest available record
          // We convert Mongoose Maps to plain objects if needed
          const toObj = (mapOrObj: any) => {
            if (!mapOrObj) return {};
            return mapOrObj instanceof Map ? Object.fromEntries(mapOrObj) : mapOrObj;
          };

          if (latestAnalytics.audienceCity || latestAnalytics.audienceCountry || latestAnalytics.audienceGenderAge) {
            audience = {
              city: toObj(latestAnalytics.audienceCity),
              country: toObj(latestAnalytics.audienceCountry),
              genderAge: toObj(latestAnalytics.audienceGenderAge),
              activeTime: toObj(latestAnalytics.audienceActiveTime),
            };
          }
        }

        // Always try to attach AI Best Active Time from the Instagram account
        // This ensures V4 insights appear even if "classic" demographics are missing
        const instagramAccount = accounts.find((a: any) => a.platform === 'instagram');
        if (instagramAccount?.aiBestActiveTime) {
          if (!audience) audience = {};
          audience.aiBestActiveTime = instagramAccount.aiBestActiveTime;
        }
      } catch (error) {
        this.logError('getPerformanceSummary', error as Error, { workspaceId });
      }


      // P2-FIX: Stop reverse-engineering deltas. Use the sum of growth from overview.
      // FIX: Query ContentModel for ACTUAL posts in this period
      let postsCount = await ContentModel.countDocuments({
        workspaceId: workspaceId,
        publishedAt: { $gte: startDate, $lte: endDate },
        status: 'published',
        $or: [
          { 'contentData.externalId': { $exists: true, $ne: null } },
          { 'contentData.id': { $exists: true, $ne: null } }
        ]
      });



      // FIX: Calculate Engagement Rate strictly for this period
      // (Likes + Comments + Shares) / Followers * 100
      // Do NOT use fallback to lifetime engagement if 0
      const totalInteractions = (overview.totalLikes || 0) + (overview.totalComments || 0) + (overview.totalShares || 0);
      const periodEngagementRate = overview.latestFollowers > 0
        ? (totalInteractions / overview.latestFollowers) * 100
        : 0;

      // FIX: Calculate Follower Growth (Net Change)
      // If we have a prior record, use it as baseline. Otherwise use starting value from aggregation.
      let baselineFollowers = overview.startFollowers || 0;
      const baselineRecord = await analyticsRepository.findOneBeforeDate(workspaceId, startDate, latestAnalytics?.platform);

      if (baselineRecord) {
        baselineFollowers = baselineRecord.followers;
      }

      // Net Growth = End - Start
      // FIX: Ensure baseline is never 0 if we have historical data
      let finalBaseline = baselineFollowers;
      if (!baselineRecord && (overview.startFollowers || 0) > 0) {
        finalBaseline = overview.startFollowers;
      }

      const netFollowers = (overview.latestFollowers || 0) - finalBaseline;

      // FIX: Calculate Gains and Losses from daily deltas
      let followerGains = 0;
      let followerLosses = 0;

      let previousVal = finalBaseline;

      if (dailyMetrics.length > 0) {
        for (const metric of dailyMetrics) {
          const delta = metric.followers - previousVal;
          if (delta > 0) followerGains += delta;
          else if (delta < 0) followerLosses += Math.abs(delta);
          previousVal = metric.followers;
        }
      }

      // Map top-level fields for mobile client (STABILITY FIX)
      // Pull live totals directly from the connected accounts rather than the locked baseline
      const liveTotalFollowers = accounts.reduce((sum, acc) => sum + ((acc as any).followersCount || 0), 0);
      let finalFollowersTotal = liveTotalFollowers;
      let finalReach = overview.totalReach || 0;
      let finalPosts = postsCount;
      let finalEngagement = periodEngagementRate;

      // LIFETIME OVERRIDE (days = 90)
      if (days === 90) {
        // For Lifetime, we sum the totals directly from the connected accounts
        const totalReach = accounts.reduce((sum, acc) => sum + (acc.totalReach || 0), 0);
        const totalFollowers = accounts.reduce((sum, acc) => sum + (acc.followersCount || 0), 0);
        const totalPosts = accounts.reduce((sum, acc) => sum + (acc.mediaCount || 0), 0);
        const avgEngagement = accounts.length > 0
          ? accounts.reduce((sum, acc) => sum + (acc.avgEngagement || acc.engagementRate || 0), 0) / accounts.length
          : 0;

        finalReach = totalReach;
        finalFollowersTotal = totalFollowers;
        finalPosts = totalPosts;
        finalEngagement = avgEngagement;

        // Also update overview for deep-dives
        overview.totalReach = totalReach;
        overview.latestFollowers = totalFollowers;
        postsCount = totalPosts;
      }

      return {
        overview: {
          ...overview,
          totalPosts: postsCount,
          totalFollowers: finalFollowersTotal,
          followerGains,
          followerLosses
        },
        growth,
        growthRate: growth ? {
          followers: growth.followerGrowth || 0,
          reach: growth.viewsGrowth || 0,
          engagement: growth.engagementGrowth || 0
        } : undefined,
        dailyMetrics,
        reach: finalReach,
        followers: finalFollowersTotal, // BIG NUMBER: Global latest
        growthDelta: netFollowers, // Badge: Growth delta (+1)
        posts: finalPosts,
        engagement: finalEngagement,
        period: days === 90 ? 'Lifetime' : `${days}D`,
        audience
      };
    });
  }

  async cleanupOldAnalytics(workspaceId: string, olderThanDays: number = 365): Promise<number> {
    return this.withErrorHandling('cleanupOldAnalytics', async () => {
      if (olderThanDays < 30) {
        throw new ValidationError('Cannot delete analytics newer than 30 days');
      }

      const deletedCount = await analyticsRepository.deleteOldAnalytics(workspaceId, olderThanDays);
      this.log('cleanupOldAnalytics', 'Old analytics cleaned up', {
        workspaceId,
        olderThanDays,
        deletedCount
      });
      return deletedCount;
    });
  }
}

export const analyticsService = new AnalyticsService();
