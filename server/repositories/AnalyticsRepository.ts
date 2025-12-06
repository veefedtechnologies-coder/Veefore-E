import { BaseRepository, PaginationOptions } from './BaseRepository';
import { AnalyticsModel, IAnalytics } from '../models/Analytics';
import { logger } from '../config/logger';
import { DatabaseError } from '../errors';

export class AnalyticsRepository extends BaseRepository<IAnalytics> {
  constructor() {
    super(AnalyticsModel, 'Analytics');
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

  async findByWorkspaceAndDateRange(
    workspaceId: string,
    startDate: Date,
    endDate: Date
  ): Promise<IAnalytics[]> {
    return this.findAll({
      workspaceId,
      date: { $gte: startDate, $lte: endDate }
    });
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

  async getOrCreateForDate(
    workspaceId: string,
    platform: string,
    date: Date
  ): Promise<IAnalytics> {
    const startTime = Date.now();
    const dateOnly = new Date(date.toISOString().split('T')[0]);
    
    try {
      let analytics = await this.findOne({
        workspaceId,
        platform,
        date: dateOnly
      });

      if (!analytics) {
        analytics = await this.create({
          workspaceId,
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
      engagement?: number;
      reach?: number;
      customMetrics?: Record<string, any>;
    }
  ): Promise<IAnalytics | null> {
    const updateData: any = {};
    
    if (metrics.views !== undefined) updateData.views = metrics.views;
    if (metrics.likes !== undefined) updateData.likes = metrics.likes;
    if (metrics.comments !== undefined) updateData.comments = metrics.comments;
    if (metrics.shares !== undefined) updateData.shares = metrics.shares;
    if (metrics.followers !== undefined) updateData.followers = metrics.followers;
    if (metrics.engagement !== undefined) updateData.engagement = metrics.engagement;
    if (metrics.reach !== undefined) updateData.reach = metrics.reach;
    if (metrics.customMetrics) updateData.metrics = metrics.customMetrics;

    return this.updateById(analyticsId, updateData);
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
    platform?: string
  ): Promise<{
    totalViews: number;
    totalLikes: number;
    totalComments: number;
    totalShares: number;
    avgEngagement: number;
    totalReach: number;
    latestFollowers: number;
  }> {
    const startTime = Date.now();
    try {
      const match: any = {
        workspaceId,
        date: { $gte: startDate, $lte: endDate }
      };
      if (platform) {
        match.platform = platform;
      }

      const result = await this.model.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            totalViews: { $sum: '$views' },
            totalLikes: { $sum: '$likes' },
            totalComments: { $sum: '$comments' },
            totalShares: { $sum: '$shares' },
            avgEngagement: { $avg: '$engagement' },
            totalReach: { $sum: '$reach' },
            latestFollowers: { $last: '$followers' }
          }
        }
      ]).exec();

      logger.db.query('getAggregatedMetrics', this.entityName, Date.now() - startTime, { workspaceId, startDate, endDate, platform });
      
      return result[0] || {
        totalViews: 0,
        totalLikes: 0,
        totalComments: 0,
        totalShares: 0,
        avgEngagement: 0,
        totalReach: 0,
        latestFollowers: 0
      };
    } catch (error) {
      logger.db.error('getAggregatedMetrics', error, { entityName: this.entityName, workspaceId });
      throw new DatabaseError('Failed to get aggregated metrics', error as Error);
    }
  }

  async getDailyMetrics(
    workspaceId: string,
    startDate: Date,
    endDate: Date,
    platform?: string
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
        workspaceId,
        date: { $gte: startDate, $lte: endDate }
      };
      if (platform) {
        match.platform = platform;
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

      logger.db.query('getDailyMetrics', this.entityName, Date.now() - startTime, { workspaceId, startDate, endDate, platform });
      
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
    const midDate = new Date();
    midDate.setDate(midDate.getDate() - Math.floor(days / 2));

    try {
      const [firstHalf, secondHalf] = await Promise.all([
        this.model.aggregate([
          {
            $match: {
              workspaceId,
              platform,
              date: { $gte: startDate, $lt: midDate }
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
              workspaceId,
              platform,
              date: { $gte: midDate, $lte: endDate }
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

      const first = firstHalf[0] || { avgFollowers: 0, avgEngagement: 0, avgViews: 0 };
      const second = secondHalf[0] || { avgFollowers: 0, avgEngagement: 0, avgViews: 0 };

      const calculateGrowth = (oldVal: number, newVal: number): number => {
        if (oldVal === 0) return newVal > 0 ? 100 : 0;
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
}

export const analyticsRepository = new AnalyticsRepository();
