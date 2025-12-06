import { BaseService } from './BaseService';
import { analyticsRepository } from '../repositories';
import { IAnalytics } from '../models/Analytics';
import { NotFoundError, ValidationError } from '../errors';

interface RecordMetricsInput {
  workspaceId: string;
  platform: string;
  date?: Date;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  followers?: number;
  engagement?: number;
  reach?: number;
  customMetrics?: Record<string, any>;
}

interface DateRangeQuery {
  workspaceId: string;
  startDate: Date;
  endDate: Date;
  platform?: string;
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
        date
      );

      const updated = await analyticsRepository.updateMetrics((analytics._id as any).toString(), {
        views: input.views,
        likes: input.likes,
        comments: input.comments,
        shares: input.shares,
        followers: input.followers,
        engagement: input.engagement,
        reach: input.reach,
        customMetrics: input.customMetrics
      });

      if (!updated) {
        throw new Error('Failed to update analytics');
      }

      this.log('recordMetrics', 'Metrics recorded', {
        workspaceId: input.workspaceId,
        platform: input.platform,
        date
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

  async getAnalyticsByDateRange(query: DateRangeQuery): Promise<IAnalytics[]> {
    return this.withErrorHandling('getAnalyticsByDateRange', async () => {
      if (query.startDate > query.endDate) {
        throw new ValidationError('Start date must be before end date');
      }

      if (query.platform) {
        return analyticsRepository.findByPlatformAndDateRange(
          query.workspaceId,
          query.platform,
          query.startDate,
          query.endDate
        );
      }

      return analyticsRepository.findByWorkspaceAndDateRange(
        query.workspaceId,
        query.startDate,
        query.endDate
      );
    });
  }

  async getAggregatedMetrics(query: DateRangeQuery) {
    return this.withErrorHandling('getAggregatedMetrics', async () => {
      if (query.startDate > query.endDate) {
        throw new ValidationError('Start date must be before end date');
      }

      return analyticsRepository.getAggregatedMetrics(
        query.workspaceId,
        query.startDate,
        query.endDate,
        query.platform
      );
    });
  }

  async getDailyMetrics(query: DateRangeQuery) {
    return this.withErrorHandling('getDailyMetrics', async () => {
      if (query.startDate > query.endDate) {
        throw new ValidationError('Start date must be before end date');
      }

      return analyticsRepository.getDailyMetrics(
        query.workspaceId,
        query.startDate,
        query.endDate,
        query.platform
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
  }> {
    return this.withErrorHandling('getPerformanceSummary', async () => {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const [overview, dailyMetrics] = await Promise.all([
        this.getAggregatedMetrics({ workspaceId, startDate, endDate }),
        this.getDailyMetrics({ workspaceId, startDate, endDate })
      ]);

      let growth = null;
      try {
        const latestAnalytics = await analyticsRepository.findLatestByWorkspace(workspaceId);
        if (latestAnalytics) {
          growth = await this.getGrowthRate(workspaceId, latestAnalytics.platform, days);
        }
      } catch (error) {
        this.logError('getPerformanceSummary', error as Error, { workspaceId });
      }

      return {
        overview,
        growth,
        dailyMetrics
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
