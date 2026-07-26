import { BaseService } from './BaseService';
import { analyticsRepository } from '../repositories/AnalyticsRepository';
import { socialAccountRepository } from '../repositories/SocialAccountRepository';
import { getAccessTokenFromAccount } from '../storage/converters';
import { ContentModel } from '../models/Content/Content';
import { IAnalytics, InstagramFollowerSnapshotModel } from '../models/Analytics';
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

      let baselinePosts = analytics.posts;

      // Prior record (most recent before today) — reused for both the posts
      // baseline and reach carry-forward.
      const startOfDayForPrior = new Date(date);
      startOfDayForPrior.setUTCHours(0, 0, 0, 0);
      const priorRecord = await analyticsRepository.findOneBeforeDate(
        input.workspaceId,
        startOfDayForPrior,
        input.platform,
        input.accountId
      );

      if (analytics.posts === 0) {
        const MAX_GAP_MS = 2 * 24 * 60 * 60 * 1000;
        const isRecent = priorRecord && (startOfDayForPrior.getTime() - new Date(priorRecord.date).getTime() <= MAX_GAP_MS);

        if (isRecent && priorRecord!.posts > 0) {
          baselinePosts = priorRecord!.posts;
        } else {
          baselinePosts = input.posts || 0;
        }
      }

      // Reach resolution (defence-in-depth with getOrCreateForDate inheritance).
      // Account-level reach (reach / reachDay / reachWeek / reachDays28) is a
      // rolling de-duplicated window value Meta returns per sync — NOT a per-day
      // counter. Two layers keep it stable:
      //   1. getOrCreateForDate INHERITS prior reach when a new-day record is
      //      created, so the day never starts at a spurious 0.
      //   2. This carry-forward guards the WRITE path: if a sync omits reach
      //      (undefined — e.g. a non-insights job, or a transient fetch failure)
      //      and the current record has no value yet, fall back to the prior
      //      record's last-known-good value instead of leaving/writing 0.
      // A genuine Meta 0 is still written because then the input is `0` (defined),
      // not `undefined`. Only the account-insights job supplies fresh reach.
      const carry = (
        inputVal: number | undefined,
        currentVal: number | undefined,
        priorVal: number | undefined
      ): number | undefined => {
        if (inputVal !== undefined) return inputVal;        // fresh value (incl. explicit 0)
        if (currentVal && currentVal > 0) return currentVal; // already set on this record
        if (priorVal && priorVal > 0) return priorVal;       // carry last known good
        return currentVal;                                   // nothing better available
      };

      const reachResolved = carry(input.reach, analytics.reach, priorRecord?.reach);
      const reachDayResolved = carry(input.reachDay, analytics.reachDay, priorRecord?.reachDay);
      const reachWeekResolved = carry(input.reachWeek, analytics.reachWeek, priorRecord?.reachWeek);
      const reachDays28Resolved = carry(input.reachDays28, analytics.reachDays28, priorRecord?.reachDays28);

      const updated = await analyticsRepository.updateMetrics((analytics._id as any).toString(), {
        // Always update engagement metrics — these are live/cumulative values
        views: input.views !== undefined ? input.views : analytics.views,
        likes: input.likes !== undefined ? input.likes : analytics.likes,
        comments: input.comments !== undefined ? input.comments : analytics.comments,
        shares: input.shares !== undefined ? input.shares : analytics.shares,
        reach: reachResolved !== undefined ? reachResolved : analytics.reach,
        reachDay: reachDayResolved !== undefined ? reachDayResolved : analytics.reachDay,
        reachWeek: reachWeekResolved !== undefined ? reachWeekResolved : analytics.reachWeek,
        reachDays28: reachDays28Resolved !== undefined ? reachDays28Resolved : analytics.reachDays28,
        viewsDay: input.customMetrics?.viewsDay !== undefined ? input.customMetrics.viewsDay : analytics.viewsDay,
        viewsWeek: input.customMetrics?.viewsWeek !== undefined ? input.customMetrics.viewsWeek : analytics.viewsWeek,
        viewsDays28: input.customMetrics?.viewsDays28 !== undefined ? input.customMetrics.viewsDays28 : analytics.viewsDays28,
        engagement: input.engagement !== undefined ? input.engagement : analytics.engagement,
        // Followers should reflect the latest end-of-day state
        followers: input.followers !== undefined ? input.followers : analytics.followers,
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
      /** Unified best-time recommendation (audience-online + engagement + reach). */
      smartBestTime?: any;
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

        // Attach the unified best-time recommendation (audience-online + engagement +
        // reach, all read from the DB — server/services/bestTimeEngine.ts) so
        // insights appear even if "classic" demographics are missing.
        const { getSmartBestTime } = await import('./bestTimeService');
        const smart = await getSmartBestTime(workspaceId);
        if (smart?.bestSlot) {
          if (!audience) audience = {};
          audience.smartBestTime = smart;
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

  async getFollowerAnalytics(workspaceId: string): Promise<{
    currentFollowers: number;
    instagramFollowers: number;
    facebookFollowers: number;
    dailyGrowth: number;
    dailyGained: number;
    dailyLost: number;
    prevDailyGrowth: number;
    prevDailyGained: number;
    prevDailyLost: number;
    weeklyGrowth: number;
    weeklyGained: number;
    weeklyLost: number;
    prevWeeklyGrowth: number;
    prevWeeklyGained: number;
    prevWeeklyLost: number;
    monthlyGrowth: number;
    monthlyGained: number;
    monthlyLost: number;
    prevMonthlyGrowth: number;
    prevMonthlyGained: number;
    prevMonthlyLost: number;
    growthPercentage: number;
    trend: 'up' | 'down' | 'flat';
  }> {
    return this.withErrorHandling('getFollowerAnalytics', async () => {
      const accounts = await socialAccountRepository.findActiveByWorkspace(workspaceId);
      const igAccounts = accounts.filter(a => a.platform === 'instagram');
      const fbAccounts = accounts.filter(a => a.platform === 'facebook');

      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setUTCHours(0, 0, 0, 0);

      const instagramIds = igAccounts
        .filter(a => a.accountId)
        .map(a => a.accountId as string);

      const facebookIds = fbAccounts
        .filter(a => a.accountId)
        .map(a => a.accountId as string);

      // Use InstagramFollowerSnapshot for IG currentFollowers — same source as analytics page.
      let igCurrentFollowers = igAccounts.reduce((sum, a) => sum + (a.followersCount || 0), 0);
      try {
        const { InstagramFollowerSnapshotModel } = await import('../models/Analytics');
        if (instagramIds.length > 0) {
          const snaps = await InstagramFollowerSnapshotModel.aggregate([
            { $match: { instagramUserId: { $in: instagramIds }, followerCount: { $gt: 0 } } },
            { $sort: { snapshotDate: -1 } },
            { $group: { _id: '$instagramUserId', followerCount: { $first: '$followerCount' } } },
          ]);
          if (snaps.length > 0) {
            igCurrentFollowers = snaps.reduce((sum: number, s: any) => sum + (s.followerCount || 0), 0);
          }
        }
      } catch { /* non-fatal */ }

      // Facebook current followers from SocialAccount.followersCount (updated by syncFacebookAccount).
      const fbCurrentFollowers = fbAccounts.reduce((sum, a) => sum + (a.followersCount || 0), 0);
      const currentFollowers = igCurrentFollowers + fbCurrentFollowers;

      const zero = {
        currentFollowers,
        instagramFollowers: igCurrentFollowers,
        facebookFollowers: fbCurrentFollowers,
        dailyGrowth: 0, dailyGained: 0, dailyLost: 0, prevDailyGrowth: 0, prevDailyGained: 0, prevDailyLost: 0,
        weeklyGrowth: 0, weeklyGained: 0, weeklyLost: 0, prevWeeklyGrowth: 0, prevWeeklyGained: 0, prevWeeklyLost: 0,
        monthlyGrowth: 0, monthlyGained: 0, monthlyLost: 0, prevMonthlyGrowth: 0, prevMonthlyGained: 0, prevMonthlyLost: 0,
        growthPercentage: 0, trend: 'flat' as const,
      };

      const hasInstagram = instagramIds.length > 0;
      const hasFacebook = facebookIds.length > 0;
      if (!hasInstagram && !hasFacebook) return zero;

      const AnalyticsDailyMetricModel = (await import('../models/Analytics/AnalyticsDailyMetric')).default;
      const { AnalyticsModel } = await import('../models/Analytics/Analytics');
      const METRIC_GROUP = 'follows_and_unfollows';
      const toYmd = (d: Date) => d.toISOString().slice(0, 10);
      const nowYmd = toYmd(now);

      // Sum Instagram gained & lost from AnalyticsDailyMetricModel (follows_and_unfollows group).
      const sumIgFlow = async (fromYmd: string, toYmdStr: string) => {
        if (!hasInstagram) return { gained: 0, lost: 0 };
        const rows = await AnalyticsDailyMetricModel.find({
          accountId: { $in: instagramIds },
          metricGroup: METRIC_GROUP,
          date: { $gte: fromYmd, $lte: toYmdStr },
        }).select('values').lean();
        let gained = 0, lost = 0;
        for (const r of rows) {
          const v = (r as any).values ?? {};
          gained += typeof v.gained === 'number' ? v.gained : 0;
          lost   += typeof v.lost   === 'number' ? v.lost   : 0;
        }
        return { gained, lost };
      };

      // Sum Facebook gained & lost from Analytics collection (page_daily_follows stored by syncFacebookAccount).
      // The Analytics collection stores daily records with `followers` (snapshot) and the raw
      // facebook customMetrics. New followers come from the difference between consecutive daily snapshots.
      const sumFbFlow = async (fromYmd: string, toYmdStr: string) => {
        if (!hasFacebook) return { gained: 0, lost: 0 };
        try {
          // Look at AnalyticsDailyMetricModel for facebook_insights records
          const fbInsightsRows = await AnalyticsDailyMetricModel.find({
            accountId: { $in: facebookIds },
            metricGroup: 'facebook_insights',
            date: { $gte: fromYmd, $lte: toYmdStr },
          }).select('values').lean();

          if (fbInsightsRows.length > 0) {
            // Use page_daily_follows / page_daily_unfollows_unique stored in the durable history
            let gained = 0, lost = 0;
            for (const r of fbInsightsRows) {
              const v = (r as any).values ?? {};
              gained += typeof v.page_daily_follows === 'number' ? v.page_daily_follows : 0;
              lost   += typeof v.page_daily_unfollows_unique === 'number' ? v.page_daily_unfollows_unique : 0;
            }
            return { gained, lost };
          }

          // Fallback: use Analytics collection daily snapshots (derive from consecutive follower counts)
          const fbAnalytics = await AnalyticsModel.find({
            workspaceId,
            platform: 'facebook',
            accountId: { $in: facebookIds },
            date: { $gte: new Date(fromYmd), $lte: new Date(toYmdStr + 'T23:59:59Z') },
          }).sort({ date: 1 }).lean();

          if (fbAnalytics.length >= 2) {
            let gained = 0, lost = 0;
            for (let i = 1; i < fbAnalytics.length; i++) {
              const diff = (fbAnalytics[i].followers || 0) - (fbAnalytics[i - 1].followers || 0);
              if (diff > 0) gained += diff;
              else if (diff < 0) lost += Math.abs(diff);
            }
            return { gained, lost };
          }
        } catch { /* non-fatal */ }
        return { gained: 0, lost: 0 };
      };

      // Current period windows
      const dayFrom   = toYmd(new Date(todayStart.getTime() -  1 * 24 * 60 * 60 * 1000));
      const weekFrom  = toYmd(new Date(todayStart.getTime() -  7 * 24 * 60 * 60 * 1000));
      const monthFrom = toYmd(new Date(todayStart.getTime() - 28 * 24 * 60 * 60 * 1000));

      // Previous period windows
      const prevDayFrom   = toYmd(new Date(todayStart.getTime() -  2 * 24 * 60 * 60 * 1000));
      const prevDayTo     = toYmd(new Date(todayStart.getTime() -  1 * 24 * 60 * 60 * 1000));
      const prevWeekFrom  = toYmd(new Date(todayStart.getTime() - 14 * 24 * 60 * 60 * 1000));
      const prevWeekTo    = toYmd(new Date(todayStart.getTime() -  7 * 24 * 60 * 60 * 1000));
      const prevMonthFrom = toYmd(new Date(todayStart.getTime() - 56 * 24 * 60 * 60 * 1000));
      const prevMonthTo   = toYmd(new Date(todayStart.getTime() - 28 * 24 * 60 * 60 * 1000));

      // Fetch IG + FB flows in parallel
      const [
        igDay, igWeek, igMonth, igPrevDay, igPrevWeek, igPrevMonth,
        fbDay, fbWeek, fbMonth, fbPrevDay, fbPrevWeek, fbPrevMonth,
      ] = await Promise.all([
        sumIgFlow(dayFrom, nowYmd),   sumIgFlow(weekFrom, nowYmd),   sumIgFlow(monthFrom, nowYmd),
        sumIgFlow(prevDayFrom, prevDayTo), sumIgFlow(prevWeekFrom, prevWeekTo), sumIgFlow(prevMonthFrom, prevMonthTo),
        sumFbFlow(dayFrom, nowYmd),   sumFbFlow(weekFrom, nowYmd),   sumFbFlow(monthFrom, nowYmd),
        sumFbFlow(prevDayFrom, prevDayTo), sumFbFlow(prevWeekFrom, prevWeekTo), sumFbFlow(prevMonthFrom, prevMonthTo),
      ]);

      // Combine IG + FB
      const combine = (ig: { gained: number; lost: number }, fb: { gained: number; lost: number }) => ({
        gained: ig.gained + fb.gained,
        lost: ig.lost + fb.lost,
      });

      const dayFlow   = combine(igDay, fbDay);
      const weekFlow  = combine(igWeek, fbWeek);
      const monthFlow = combine(igMonth, fbMonth);
      const prevDayFlow   = combine(igPrevDay, fbPrevDay);
      const prevWeekFlow  = combine(igPrevWeek, fbPrevWeek);
      const prevMonthFlow = combine(igPrevMonth, fbPrevMonth);

      const dailyGrowth    = dayFlow.gained   - dayFlow.lost;
      const weeklyGrowth   = weekFlow.gained  - weekFlow.lost;
      const monthlyGrowth  = monthFlow.gained - monthFlow.lost;
      const prevDailyGrowth   = prevDayFlow.gained   - prevDayFlow.lost;
      const prevWeeklyGrowth  = prevWeekFlow.gained  - prevWeekFlow.lost;
      const prevMonthlyGrowth = prevMonthFlow.gained - prevMonthFlow.lost;

      const pctChange = (cur: number, prev: number): number => {
        if (prev === 0) return cur > 0 ? 100 : cur < 0 ? -100 : 0;
        return ((cur - prev) / Math.abs(prev)) * 100;
      };

      const growthPercentage = Number(pctChange(monthlyGrowth, prevMonthlyGrowth).toFixed(2));
      const trend: 'up' | 'down' | 'flat' =
        growthPercentage > 0 ? 'up' : growthPercentage < 0 ? 'down' : 'flat';

      return {
        currentFollowers,
        instagramFollowers: igCurrentFollowers,
        facebookFollowers: fbCurrentFollowers,
        dailyGrowth,
        dailyGained:  dayFlow.gained,
        dailyLost:    dayFlow.lost,
        prevDailyGrowth,
        prevDailyGained:   prevDayFlow.gained,
        prevDailyLost:     prevDayFlow.lost,
        weeklyGrowth,
        weeklyGained:  weekFlow.gained,
        weeklyLost:    weekFlow.lost,
        prevWeeklyGrowth,
        prevWeeklyGained:  prevWeekFlow.gained,
        prevWeeklyLost:    prevWeekFlow.lost,
        monthlyGrowth,
        monthlyGained:  monthFlow.gained,
        monthlyLost:    monthFlow.lost,
        prevMonthlyGrowth,
        prevMonthlyGained: prevMonthFlow.gained,
        prevMonthlyLost:   prevMonthFlow.lost,
        growthPercentage,
        trend,
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
