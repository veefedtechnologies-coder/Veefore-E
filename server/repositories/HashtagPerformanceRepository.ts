import { HashtagPerformance, IHashtagPerformance } from '../models/HashtagPerformance/HashtagPerformance';
import { logger } from '../config/logger';

/**
 * Repository for Hashtag Performance operations
 * 
 * Provides data access methods for tracking and analyzing hashtag performance
 * across different niches and post types.
 */
export class HashtagPerformanceRepository {
  private readonly entityName = 'HashtagPerformance';

  /**
   * Log method for consistent logging
   */
  private log(method: string, message: string, data?: any) {
    logger.db.query(method, this.entityName, 0, { message, ...data });
  }

  /**
   * Log error method for consistent error logging
   */
  private logError(method: string, error: Error, context?: any) {
    logger.db.error(method, error, { entityName: this.entityName, ...context });
  }

  /**
   * Find hashtag performance record by hashtag and niche
   */
  async findByHashtagAndNiche(hashtag: string, niche: string): Promise<IHashtagPerformance | null> {
    try {
      const normalized = hashtag.toLowerCase().replace(/^#/, '');
      const normalizedNiche = niche.toLowerCase().trim();
      
      return await HashtagPerformance.findOne({
        hashtag: normalized,
        niche: normalizedNiche
      });
    } catch (error) {
      this.logError('findByHashtagAndNiche', error as Error, { hashtag, niche });
      throw error;
    }
  }

  /**
   * Get top performing hashtags for a niche
   */
  async getTopPerformingHashtags(
    niche: string,
    limit: number = 50,
    minUsageCount: number = 3
  ): Promise<IHashtagPerformance[]> {
    try {
      const normalizedNiche = niche.toLowerCase().trim();
      
      return await HashtagPerformance.find({
        niche: normalizedNiche,
        usageCount: { $gte: minUsageCount }
      })
        .sort({ avgEngagementRate: -1 })
        .limit(limit)
        .exec();
    } catch (error) {
      this.logError('getTopPerformingHashtags', error as Error, { niche, limit });
      throw error;
    }
  }

  /**
   * Get top performing hashtags by competition level
   */
  async getTopPerformingByCompetition(
    niche: string,
    competition: 'high' | 'medium' | 'low',
    limit: number = 20,
    minUsageCount: number = 3
  ): Promise<IHashtagPerformance[]> {
    try {
      const normalizedNiche = niche.toLowerCase().trim();
      
      return await HashtagPerformance.find({
        niche: normalizedNiche,
        estimatedCompetition: competition,
        usageCount: { $gte: minUsageCount }
      })
        .sort({ avgEngagementRate: -1 })
        .limit(limit)
        .exec();
    } catch (error) {
      this.logError('getTopPerformingByCompetition', error as Error, { niche, competition });
      throw error;
    }
  }

  /**
   * Record hashtag usage with performance metrics
   */
  async recordUsage(
    hashtag: string,
    niche: string,
    postId: string,
    postType: 'post' | 'story' | 'reel',
    metrics: {
      impressions: number;
      reach: number;
      likes: number;
      comments: number;
      saves: number;
      shares: number;
    },
    competition: 'high' | 'medium' | 'low',
    estimatedPostCount: number
  ): Promise<IHashtagPerformance> {
    try {
      const normalized = hashtag.toLowerCase().replace(/^#/, '');
      const normalizedNiche = niche.toLowerCase().trim();
      
      // Calculate engagement rate
      const totalEngagement = metrics.likes + metrics.comments + metrics.saves + metrics.shares;
      const engagementRate = metrics.impressions > 0 
        ? (totalEngagement / metrics.impressions) * 100 
        : 0;

      // Find existing record or create new
      let record = await this.findByHashtagAndNiche(normalized, normalizedNiche);
      
      if (record) {
        // Update existing record
        const newUsageCount = record.usageCount + 1;
        const newTotalImpressions = record.totalImpressions + metrics.impressions;
        const newTotalReach = record.totalReach + metrics.reach;
        const newTotalLikes = record.totalLikes + metrics.likes;
        const newTotalComments = record.totalComments + metrics.comments;
        const newTotalSaves = record.totalSaves + metrics.saves;
        const newTotalShares = record.totalShares + metrics.shares;
        
        // Calculate new average engagement rate
        const newAvgEngagementRate = newTotalImpressions > 0
          ? ((newTotalLikes + newTotalComments + newTotalSaves + newTotalShares) / newTotalImpressions) * 100
          : 0;

        // Update performance by type
        const typeKey = postType as 'post' | 'story' | 'reel';
        const typePerformance = record.performanceByType[typeKey];
        const newTypeCount = typePerformance.count + 1;
        const newTypeAvgEngagement = 
          ((typePerformance.avgEngagementRate * typePerformance.count) + engagementRate) / newTypeCount;

        // Limit usage history to last 50 records
        const newUsageHistory = [
          {
            postId,
            postType,
            impressions: metrics.impressions,
            reach: metrics.reach,
            engagementRate,
            recordedAt: new Date()
          },
          ...record.usageHistory
        ].slice(0, 50);

        // Update document
        record.usageCount = newUsageCount;
        record.lastUsedAt = new Date();
        record.totalImpressions = newTotalImpressions;
        record.totalReach = newTotalReach;
        record.totalLikes = newTotalLikes;
        record.totalComments = newTotalComments;
        record.totalSaves = newTotalSaves;
        record.totalShares = newTotalShares;
        record.avgEngagementRate = newAvgEngagementRate;
        record.estimatedCompetition = competition;
        record.estimatedPostCount = estimatedPostCount;
        record.performanceByType[typeKey].count = newTypeCount;
        record.performanceByType[typeKey].avgEngagementRate = newTypeAvgEngagement;
        record.usageHistory = newUsageHistory;

        await record.save();
      } else {
        // Create new record
        record = await HashtagPerformance.create({
          hashtag: normalized,
          niche: normalizedNiche,
          usageCount: 1,
          lastUsedAt: new Date(),
          totalImpressions: metrics.impressions,
          totalReach: metrics.reach,
          totalLikes: metrics.likes,
          totalComments: metrics.comments,
          totalSaves: metrics.saves,
          totalShares: metrics.shares,
          avgEngagementRate: engagementRate,
          avgDiscoverability: 0,
          avgRankingPosition: 0,
          estimatedCompetition: competition,
          estimatedPostCount,
          performanceByType: {
            post: {
              count: postType === 'post' ? 1 : 0,
              avgEngagementRate: postType === 'post' ? engagementRate : 0
            },
            story: {
              count: postType === 'story' ? 1 : 0,
              avgEngagementRate: postType === 'story' ? engagementRate : 0
            },
            reel: {
              count: postType === 'reel' ? 1 : 0,
              avgEngagementRate: postType === 'reel' ? engagementRate : 0
            }
          },
          usageHistory: [{
            postId,
            postType,
            impressions: metrics.impressions,
            reach: metrics.reach,
            engagementRate,
            recordedAt: new Date()
          }]
        });
      }

      return record;
    } catch (error) {
      this.logError('recordUsage', error as Error, { hashtag, niche, postId });
      throw error;
    }
  }

  /**
   * Get hashtag performance statistics for a niche
   */
  async getNicheStatistics(niche: string): Promise<{
    totalHashtags: number;
    avgEngagementRate: number;
    topPerformers: IHashtagPerformance[];
    performanceByCompetition: {
      high: { count: number; avgEngagement: number };
      medium: { count: number; avgEngagement: number };
      low: { count: number; avgEngagement: number };
    };
  }> {
    try {
      const normalizedNiche = niche.toLowerCase().trim();
      
      const allHashtags = await HashtagPerformance.find({ niche: normalizedNiche });
      
      const totalHashtags = allHashtags.length;
      const avgEngagementRate = totalHashtags > 0
        ? allHashtags.reduce((sum, h) => sum + h.avgEngagementRate, 0) / totalHashtags
        : 0;

      const topPerformers = await this.getTopPerformingHashtags(normalizedNiche, 10, 1);

      // Calculate performance by competition
      const highCompetition = allHashtags.filter(h => h.estimatedCompetition === 'high');
      const mediumCompetition = allHashtags.filter(h => h.estimatedCompetition === 'medium');
      const lowCompetition = allHashtags.filter(h => h.estimatedCompetition === 'low');

      const performanceByCompetition = {
        high: {
          count: highCompetition.length,
          avgEngagement: highCompetition.length > 0
            ? highCompetition.reduce((sum, h) => sum + h.avgEngagementRate, 0) / highCompetition.length
            : 0
        },
        medium: {
          count: mediumCompetition.length,
          avgEngagement: mediumCompetition.length > 0
            ? mediumCompetition.reduce((sum, h) => sum + h.avgEngagementRate, 0) / mediumCompetition.length
            : 0
        },
        low: {
          count: lowCompetition.length,
          avgEngagement: lowCompetition.length > 0
            ? lowCompetition.reduce((sum, h) => sum + h.avgEngagementRate, 0) / lowCompetition.length
            : 0
        }
      };

      return {
        totalHashtags,
        avgEngagementRate,
        topPerformers,
        performanceByCompetition
      };
    } catch (error) {
      this.logError('getNicheStatistics', error as Error, { niche });
      throw error;
    }
  }

  /**
   * Clean up old performance data (optional maintenance)
   */
  async cleanupStaleData(daysOld: number = 180): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const result = await HashtagPerformance.deleteMany({
        lastUsedAt: { $lt: cutoffDate },
        usageCount: { $lt: 3 } // Only delete rarely used hashtags
      });

      this.log('cleanupStaleData', `Cleaned up ${result.deletedCount} stale hashtag records`);
      return result.deletedCount;
    } catch (error) {
      this.logError('cleanupStaleData', error as Error, { daysOld });
      throw error;
    }
  }
}

// Export singleton instance
export const hashtagPerformanceRepository = new HashtagPerformanceRepository();
