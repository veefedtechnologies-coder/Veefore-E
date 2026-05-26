import { BaseRepository, PaginationOptions } from './BaseRepository';
import { AnalyticsModel, IAnalytics } from '../models/Analytics';
import { logger } from '../config/logger';
import { DatabaseError } from '../errors';

export class AnalyticsRepository extends BaseRepository<IAnalytics> {
  constructor() {
    super(AnalyticsModel, 'Analytics');
  }

  async createWithDefaults(data: Partial<IAnalytics>): Promise<IAnalytics> {
    return this.create({
      ...data,
      createdAt: new Date()
    });
  }

  async findByWorkspaceId(workspaceId: string, options?: PaginationOptions) {
    return this.findMany({ workspaceId }, { ...options, sortBy: 'date', sortOrder: 'desc' });
  }

  async findByWorkspaceAndPlatform(
    workspaceId: string,
    platform: string,
    options?: PaginationOptions
  ) {
    return this.findMany(
      { workspaceId, platform },
      { ...options, sortBy: 'date', sortOrder: 'desc' }
    );
  }

  async findByWorkspaceWithDaysFilter(
    workspaceId: string,
    platform?: string,
    days?: number
  ): Promise<IAnalytics[]> {
    const filter: any = { workspaceId };

    if (platform) {
      filter.platform = platform;
    }

    if (days) {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - days);
      filter.date = { $gte: daysAgo };
    }

    return this.findAll(filter);
  }

  async findByWorkspaceAndDateRange(
    workspaceId: string,
    startDate: Date,
    endDate: Date,
    platforms?: string[],
    accountIds?: string[]
  ): Promise<IAnalytics[]> {
    const query: any = {
      date: { $gte: startDate, $lte: endDate }
    };

    if (accountIds && accountIds.length > 0) {
      // Strict snapshot isolation: fetch by globally unique accountId across all workspaces
      query.accountId = { $in: accountIds };
    } else {
      query.workspaceId = workspaceId.toString();
    }

    if (platforms && platforms.length > 0) {
      query.platform = { $in: platforms };
    }

    if (accountIds && accountIds.length > 0) {
      // Strict snapshot isolation: only include the matched accountIds
      query.accountId = { $in: accountIds };
    }

    return this.model.find(query).sort({ date: 1 }).exec();
  }

  async findByPlatformAndDateRange(
    workspaceId: string,
    platform: string,
    startDate: Date,
    endDate: Date
  ): Promise<IAnalytics[]> {
    return this.findAll({
      workspaceId,
      platform,
      date: { $gte: startDate, $lte: endDate }
    });
  }

  async findLatestByWorkspace(workspaceId: string): Promise<IAnalytics | null> {
    const startTime = Date.now();
    try {
      const result = await this.model
        .findOne({ workspaceId })
        .sort({ date: -1 })
        .exec();

      logger.db.query('findLatestByWorkspace', this.entityName, Date.now() - startTime, { workspaceId });
      return result;
    } catch (error) {
      logger.db.error('findLatestByWorkspace', error, { entityName: this.entityName, workspaceId });
      throw new DatabaseError('Failed to find latest analytics', error as Error);
    }
  }

  async findLatestByPlatform(workspaceId: string, platform: string): Promise<IAnalytics | null> {
    const startTime = Date.now();
    try {
      const result = await this.model
        .findOne({ workspaceId, platform })
        .sort({ date: -1 })
        .exec();

      logger.db.query('findLatestByPlatform', this.entityName, Date.now() - startTime, { workspaceId, platform });
      return result;
    } catch (error) {
      logger.db.error('findLatestByPlatform', error, { entityName: this.entityName, workspaceId, platform });
      throw new DatabaseError('Failed to find latest platform analytics', error as Error);
    }
  }

  async findOneBeforeDate(workspaceId: string, date: Date, platform?: string, accountId?: string): Promise<IAnalytics | null> {
    const startOfDay = new Date(date);
    startOfDay.setUTCHours(0, 0, 0, 0);

    const query: any = {
      date: { $lt: startOfDay }
    };

    if (accountId) {
      query.accountId = accountId;
    } else {
      query.workspaceId = workspaceId.toString();
    }

    if (platform) {
      query.platform = platform;
    }

    return this.model.findOne(query).sort({ date: -1 }).exec();
  }

  async getOrCreateForDate(
    workspaceId: string,
    platform: string,
    date: Date,
    accountId?: string
  ): Promise<IAnalytics> {
    const startTime = Date.now();
    const dateOnly = new Date(date.toISOString().split('T')[0]);

    try {
      const queryParams: any = {
        platform,
        date: dateOnly
      };
      
      if (accountId) {
        queryParams.accountId = accountId;
      } else {
        queryParams.workspaceId = workspaceId;
      }

      let analytics = await this.findOne(queryParams);

      if (!analytics) {
        analytics = await this.create({
          workspaceId,
          accountId,
          platform,
          date: dateOnly,
          metrics: {},
          views: 0,
          likes: 0,
          comments: 0,
          shares: 0,
          followers: 0,
          engagement: 0,
          reach: 0
        });
      }

      logger.db.query('getOrCreateForDate', this.entityName, Date.now() - startTime, { workspaceId, platform, date: dateOnly });
      return analytics;
    } catch (error) {
      logger.db.error('getOrCreateForDate', error, { entityName: this.entityName, workspaceId, platform });
      throw new DatabaseError('Failed to get or create analytics', error as Error);
    }
  }

  async updateMetrics(
    analyticsId: string,
    metrics: {
      views?: number;
      likes?: number;
      comments?: number;
      shares?: number;
      followers?: number;
      posts?: number;
      reach?: number;
      reachDay?: number;
      reachWeek?: number;
      reachDays28?: number;
      engagement?: number;
      customMetrics?: Record<string, any>;
      audienceCity?: Record<string, number>;
      audienceCountry?: Record<string, number>;
      audienceGenderAge?: Record<string, number>;
      audienceActiveTime?: Record<string, number>;
    }
  ): Promise<IAnalytics | null> {
    const startTime = Date.now();
    try {
      const { followers, posts, ...liveMetrics } = metrics;
      
      const updateData: any = { ...liveMetrics };
      if (metrics.customMetrics) {
        updateData.metrics = metrics.customMetrics;
        delete updateData.customMetrics;
      }

      // Build the update operation:
      // - Always update live metrics (engagement, reach, likes, etc.) with $set
      // - Only set followers and posts ONCE (when baseline is 0) using $min trick or conditional
      const updateOp: any = { $set: updateData };

      // Use $set with a filter on followers=0 to only set baseline when not yet established
      // We do this in two steps: first update all live metrics, then conditionally set baseline
      const result = await this.model.findOneAndUpdate(
        { _id: analyticsId },
        { $set: updateData },
        { new: true }
      ).exec();

      // Now conditionally set followers and posts ONLY if they are currently 0
      if (result && (followers !== undefined || posts !== undefined)) {
        const baselineSet: any = {};
        if (followers !== undefined && result.followers === 0) baselineSet.followers = followers;
        if (posts !== undefined && result.posts === 0) baselineSet.posts = posts;
        
        if (Object.keys(baselineSet).length > 0) {
          await this.model.findOneAndUpdate(
            { _id: analyticsId, $or: [{ followers: 0 }, { posts: 0 }] },
            { $set: baselineSet },
            { new: true }
          ).exec();
          return this.model.findById(analyticsId).exec();
        }
      }


      logger.db.query('updateMetrics', this.entityName, Date.now() - startTime, { analyticsId });
      return result;
    } catch (error) {
      logger.db.error('updateMetrics', error, { entityName: this.entityName, analyticsId });
      throw new DatabaseError('Failed to update metrics', error as Error);
    }
  }

  async incrementMetrics(
    analyticsId: string,
    increments: {
      views?: number;
      likes?: number;
      comments?: number;
      shares?: number;
      followers?: number;
      reach?: number;
    }
  ): Promise<IAnalytics | null> {
    const startTime = Date.now();
    try {
      const result = await this.model
        .findByIdAndUpdate(
          analyticsId,
          { $inc: increments },
          { new: true }
        )
        .exec();

      logger.db.query('incrementMetrics', this.entityName, Date.now() - startTime, { analyticsId });
      return result;
    } catch (error) {
      logger.db.error('incrementMetrics', error, { entityName: this.entityName, analyticsId });
      throw new DatabaseError('Failed to increment metrics', error as Error);
    }
  }

  async getAggregatedMetrics(
    workspaceId: string,
    startDate: Date,
    endDate: Date,
    platforms?: string[]
  ): Promise<{
    totalViews: number;
    totalLikes: number;
    totalComments: number;
    totalShares: number;
    avgEngagement: number;
    totalReach: number;
    latestFollowers: number;
    startFollowers: number;
    totalPosts: number;
  }> {
    const startTime = Date.now();
    const match: any = {
      workspaceId: workspaceId.toString(),
      date: { $gte: startDate, $lte: endDate }
    };
    if (platforms && platforms.length > 0) {
      match.platform = { $in: platforms };
    }
    logger.info(`[DEBUG] getAggregatedMetrics: matching workspaceId=${workspaceId.toString()}, range=${startDate} to ${endDate}, platforms=${platforms?.join(',') || 'ALL'}`);

    try {
      const result = await this.model.aggregate([
        { $match: match },
        { $sort: { date: 1 } },
        {
          $group: {
            _id: null,
            totalViews: { $sum: '$views' },
            totalLikes: { $sum: '$likes' },
            totalComments: { $sum: '$comments' },
            totalShares: { $sum: '$shares' },
            avgEngagement: { $avg: '$engagement' },
            sumDailyReach: { $sum: '$reachDay' },
            latestWeekReach: { $last: '$reachWeek' },
            latestMonthReach: { $last: '$reachDays28' },
            startReachSnapshot: { $first: '$reach' },
            endReachSnapshot: { $last: '$reach' },
            latestFollowers: { $last: '$followers' },
            totalPosts: { $sum: '$posts' },
            startFollowers: { $first: '$followers' },
            totalPostsSnapshot: { $last: '$metrics.posts' },
            engagementSnapshot: { $last: '$engagement' }
          }
        },
        {
          $project: {
            totalViews: 1,
            totalLikes: 1,
            totalComments: 1,
            totalShares: 1,
            avgEngagement: 1,
            latestFollowers: 1,
            totalPosts: 1,
            startFollowers: 1,
            totalPostsSnapshot: 1,
            engagementSnapshot: 1,
            sumDailyReach: 1,
            startReachSnapshot: 1,
            endReachSnapshot: 1,
            totalReach: {
              $let: {
                vars: {
                  diffDays: { $divide: [{ $subtract: [endDate, startDate] }, 86400000] }
                },
                in: {
                  $cond: [
                    { $lte: ['$$diffDays', 1.5] },
                    '$sumDailyReach',
                    {
                      $cond: [
                        { $lte: ['$$diffDays', 7.5] },
                        { $ifNull: ['$latestWeekReach', 0] },
                        {
                          $cond: [
                            { $lte: ['$$diffDays', 31] },
                            { $ifNull: ['$latestMonthReach', 0] },
                            // For 90D+, use the media-aggregated total reach (endReachSnapshot)
                            // instead of capping at the 28-day API snapshot.
                            { $ifNull: ['$endReachSnapshot', 0] }
                          ]
                        }
                      ]
                    }
                  ]
                }
              }
            }
          }
        },
      ]).exec();

      logger.info(`[DEBUG] getAggregatedMetrics: matched ${result.length} groups. Result: ${JSON.stringify(result[0] || 'NONE')}`);

      if (!result.length) {
        return {
          totalViews: 0,
          totalLikes: 0,
          totalComments: 0,
          totalShares: 0,
          avgEngagement: 0,
          totalReach: 0,
          latestFollowers: 0,
          startFollowers: 0,
          totalPosts: 0
        };
      }

      const aggregated = result[0];

      // P2-FIX: Calculate period-accurate engagement rate from sums
      // (Total Engagements in period / Latest Follower Count) * 100
      if (aggregated.latestFollowers > 0) {
        const totalEngagements = (aggregated.totalLikes || 0) + (aggregated.totalComments || 0) + (aggregated.totalShares || 0);
        const calculatedER = (totalEngagements / aggregated.latestFollowers) * 100;

        // Use the sum-based growth if it exists, otherwise fall back to the authentic sync snapshot
        if (calculatedER > 0) {
          aggregated.avgEngagement = calculatedER;
        } else {
          aggregated.avgEngagement = aggregated.engagementSnapshot || 0;
        }
      } else {
        aggregated.avgEngagement = 0;
      }

      // P4-FIX: Post count fallback for long-term views
      if (aggregated.totalPosts === 0 && aggregated.totalPostsSnapshot > 0) {
        aggregated.totalPosts = aggregated.totalPostsSnapshot;
      }

      logger.db.query('getAggregatedMetrics', this.entityName, Date.now() - startTime, { workspaceId, startDate, endDate, platforms });
      return aggregated;
    } catch (error) {
      logger.db.error('getAggregatedMetrics', error, { entityName: this.entityName, workspaceId });
      throw new DatabaseError('Failed to get aggregated metrics', error as Error);
    }
  }

  async getDailyMetrics(
    workspaceId: string,
    startDate: Date,
    endDate: Date,
    platforms?: string[]
  ): Promise<Array<{
    date: Date;
    views: number;
    likes: number;
    comments: number;
    shares: number;
    engagement: number;
    reach: number;
    followers: number;
  }>> {
    const startTime = Date.now();
    try {
      const match: any = {
        workspaceId: workspaceId.toString(),
        date: { $gte: startDate, $lte: endDate }
      };
      if (platforms && platforms.length > 0) {
        match.platform = { $in: platforms };
      }

      const result = await this.model.aggregate([
        { $match: match },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
            views: { $sum: '$views' },
            likes: { $sum: '$likes' },
            comments: { $sum: '$comments' },
            shares: { $sum: '$shares' },
            engagement: { $avg: '$engagement' },
            reach: { $sum: '$reach' },
            followers: { $max: '$followers' }
          }
        },
        { $sort: { _id: 1 } }
      ]).exec();

      logger.db.query('getDailyMetrics', this.entityName, Date.now() - startTime, { workspaceId, startDate, endDate, platforms });

      return result.map((item: any) => ({
        date: new Date(item._id),
        views: item.views,
        likes: item.likes,
        comments: item.comments,
        shares: item.shares,
        engagement: item.engagement,
        reach: item.reach,
        followers: item.followers
      }));
    } catch (error) {
      logger.db.error('getDailyMetrics', error, { entityName: this.entityName, workspaceId });
      throw new DatabaseError('Failed to get daily metrics', error as Error);
    }
  }

  async getGrowthRate(
    workspaceId: string,
    platform: string,
    days: number = 30
  ): Promise<{
    followerGrowth: number;
    engagementGrowth: number;
    viewsGrowth: number;
  }> {
    const startTime = Date.now();
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // PREVIOUS PERIOD for comparison (Current window vs Previous window)
    const prevEndDate = new Date(startDate);
    const prevStartDate = new Date(startDate);
    prevStartDate.setDate(prevStartDate.getDate() - days);

    try {
      const [previousPeriod, currentPeriod] = await Promise.all([
        this.model.aggregate([
          {
            $match: {
              workspaceId: workspaceId.toString(),
              platform,
              date: { $gte: prevStartDate, $lt: prevEndDate }
            }
          },
          {
            $group: {
              _id: null,
              avgFollowers: { $avg: '$followers' },
              avgEngagement: { $avg: '$engagement' },
              avgViews: { $avg: '$views' }
            }
          }
        ]).exec(),
        this.model.aggregate([
          {
            $match: {
              workspaceId: workspaceId.toString(),
              platform,
              date: { $gte: startDate, $lte: endDate }
            }
          },
          {
            $group: {
              _id: null,
              avgFollowers: { $avg: '$followers' },
              avgEngagement: { $avg: '$engagement' },
              avgViews: { $avg: '$views' }
            }
          }
        ]).exec()
      ]);

      const first = previousPeriod[0] || { avgFollowers: 0, avgEngagement: 0, avgViews: 0 };
      const second = currentPeriod[0] || { avgFollowers: 0, avgEngagement: 0, avgViews: 0 };

      const calculateGrowth = (oldVal: number, newVal: number): number => {
        if (oldVal === 0) return 0;
        return ((newVal - oldVal) / oldVal) * 100;
      };

      logger.db.query('getGrowthRate', this.entityName, Date.now() - startTime, { workspaceId, platform, days });

      return {
        followerGrowth: calculateGrowth(first.avgFollowers, second.avgFollowers),
        engagementGrowth: calculateGrowth(first.avgEngagement, second.avgEngagement),
        viewsGrowth: calculateGrowth(first.avgViews, second.avgViews)
      };
    } catch (error) {
      logger.db.error('getGrowthRate', error, { entityName: this.entityName, workspaceId, platform });
      throw new DatabaseError('Failed to get growth rate', error as Error);
    }
  }

  async deleteOldAnalytics(workspaceId: string, olderThanDays: number): Promise<number> {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - olderThanDays);

    return this.deleteMany({
      workspaceId,
      date: { $lt: threshold }
    });
  }

  async getPlatformSummary(workspaceId: string): Promise<Array<{
    platform: string;
    followers: number;
    engagementRate: number;
    reach: number;
  }>> {
    const startTime = Date.now();
    try {
      // Get the latest analytics record for each platform in this workspace
      const result = await this.model.aggregate([
        { $match: { workspaceId: workspaceId.toString() } },
        { $sort: { date: -1 } },
        {
          $group: {
            _id: '$platform',
            followers: { $first: '$followers' },
            engagement: { $first: '$engagement' },
            reach: { $first: '$reach' },
            views: { $first: '$views' }
          }
        },
        {
          $project: {
            _id: 0,
            platform: '$_id',
            followers: 1,
            reach: 1,
            engagementRate: {
              $cond: [
                { $gt: ['$reach', 0] },
                { $multiply: [{ $divide: ['$engagement', '$reach'] }, 100] },
                0
              ]
            }
          }
        }
      ]).exec();

      logger.db.query('getPlatformSummary', this.entityName, Date.now() - startTime, { workspaceId });
      return result;
    } catch (error) {
      logger.db.error('getPlatformSummary', error, { entityName: this.entityName, workspaceId });
      throw new DatabaseError('Failed to get platform summary', error as Error);
    }
  }
}

export const analyticsRepository = new AnalyticsRepository();
