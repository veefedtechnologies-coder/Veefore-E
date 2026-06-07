import { BaseRepository } from './BaseRepository';
import { GeneratedCaptionModel, IGeneratedCaption } from '../models/AI';
import { logger } from '../config/logger';
import { DatabaseError } from '../errors';

/**
 * Generated Caption Repository
 * 
 * Handles database operations for generated captions including
 * storing predictions, tracking user selections, and recording
 * actual performance metrics for learning.
 * 
 * Requirements: 8.3, 10.1, 10.2, 10.3
 */
export class GeneratedCaptionRepository extends BaseRepository<IGeneratedCaption> {
  constructor() {
    super(GeneratedCaptionModel, 'GeneratedCaption');
  }

  /**
   * Find generated captions by user and workspace
   */
  async findByUserAndWorkspace(
    userId: string,
    workspaceId: string,
    limit: number = 10
  ): Promise<IGeneratedCaption[]> {
    const startTime = Date.now();
    try {
      const result = await this.model
        .find({ userId, workspaceId })
        .sort({ generatedAt: -1 })
        .limit(limit)
        .exec();
      
      logger.db.query('findByUserAndWorkspace', this.entityName, Date.now() - startTime, {
        userId,
        workspaceId,
        count: result.length
      });
      
      return result;
    } catch (error) {
      logger.db.error('findByUserAndWorkspace', error, { userId, workspaceId });
      throw new DatabaseError(
        `Failed to find generated captions for user ${userId}`,
        error as Error
      );
    }
  }

  /**
   * Find generated caption by content ID
   */
  async findByContentId(contentId: string): Promise<IGeneratedCaption | null> {
    const startTime = Date.now();
    try {
      const result = await this.model
        .findOne({ contentId })
        .sort({ generatedAt: -1 })
        .exec();
      
      logger.db.query('findByContentId', this.entityName, Date.now() - startTime, {
        contentId
      });
      
      return result;
    } catch (error) {
      logger.db.error('findByContentId', error, { contentId });
      throw new DatabaseError(
        `Failed to find generated caption for content ${contentId}`,
        error as Error
      );
    }
  }

  /**
   * Find published captions with performance data for a user
   * Used for calculating average metrics and learning
   */
  async findPublishedWithPerformance(
    userId: string,
    workspaceId: string,
    limit: number = 50
  ): Promise<IGeneratedCaption[]> {
    const startTime = Date.now();
    try {
      const result = await this.model
        .find({
          userId,
          workspaceId,
          publishedAt: { $exists: true },
          'actualMetrics.impressions': { $gt: 0 }
        })
        .sort({ publishedAt: -1 })
        .limit(limit)
        .exec();
      
      logger.db.query('findPublishedWithPerformance', this.entityName, Date.now() - startTime, {
        userId,
        workspaceId,
        count: result.length
      });
      
      return result;
    } catch (error) {
      logger.db.error('findPublishedWithPerformance', error, { userId, workspaceId });
      throw new DatabaseError(
        `Failed to find published captions with performance for user ${userId}`,
        error as Error
      );
    }
  }

  /**
   * Update actual performance metrics for a caption
   */
  async updatePerformanceMetrics(
    captionId: string,
    metrics: {
      likes: number;
      comments: number;
      saves: number;
      shares: number;
      impressions: number;
    }
  ): Promise<IGeneratedCaption | null> {
    const startTime = Date.now();
    try {
      // Calculate engagement rate
      const engagementRate = metrics.impressions > 0
        ? ((metrics.likes + metrics.comments + metrics.saves + metrics.shares) / metrics.impressions) * 100
        : 0;

      const result = await this.model
        .findByIdAndUpdate(
          captionId,
          {
            actualMetrics: {
              ...metrics,
              engagementRate
            },
            performanceRecordedAt: new Date()
          },
          { new: true, runValidators: true }
        )
        .exec();
      
      logger.db.query('updatePerformanceMetrics', this.entityName, Date.now() - startTime, {
        captionId,
        engagementRate: engagementRate.toFixed(2)
      });
      
      return result;
    } catch (error) {
      logger.db.error('updatePerformanceMetrics', error, { captionId });
      throw new DatabaseError(
        `Failed to update performance metrics for caption ${captionId}`,
        error as Error
      );
    }
  }

  /**
   * Record user selection of a variation
   */
  async recordSelection(
    captionId: string,
    selectedVariationIndex: number,
    wasEdited: boolean,
    originalCaption?: string,
    editedCaption?: string,
    editDistance?: number
  ): Promise<IGeneratedCaption | null> {
    const startTime = Date.now();
    try {
      const result = await this.model
        .findByIdAndUpdate(
          captionId,
          {
            selectedVariationIndex,
            wasEdited,
            originalCaption,
            editedCaption,
            editDistance
          },
          { new: true, runValidators: true }
        )
        .exec();
      
      logger.db.query('recordSelection', this.entityName, Date.now() - startTime, {
        captionId,
        selectedVariationIndex,
        wasEdited
      });
      
      return result;
    } catch (error) {
      logger.db.error('recordSelection', error, { captionId });
      throw new DatabaseError(
        `Failed to record selection for caption ${captionId}`,
        error as Error
      );
    }
  }

  /**
   * Mark caption as published
   */
  async markAsPublished(
    captionId: string,
    publishedAt: Date = new Date()
  ): Promise<IGeneratedCaption | null> {
    const startTime = Date.now();
    try {
      const result = await this.model
        .findByIdAndUpdate(
          captionId,
          { publishedAt },
          { new: true, runValidators: true }
        )
        .exec();
      
      logger.db.query('markAsPublished', this.entityName, Date.now() - startTime, {
        captionId
      });
      
      return result;
    } catch (error) {
      logger.db.error('markAsPublished', error, { captionId });
      throw new DatabaseError(
        `Failed to mark caption ${captionId} as published`,
        error as Error
      );
    }
  }

  /**
   * Get captions with prediction accuracy data
   * (captions that have both predictions and actual metrics)
   */
  async findWithPredictionAccuracy(
    userId: string,
    workspaceId: string,
    limit: number = 100
  ): Promise<IGeneratedCaption[]> {
    const startTime = Date.now();
    try {
      const result = await this.model
        .find({
          userId,
          workspaceId,
          performanceRecordedAt: { $exists: true },
          'actualMetrics.impressions': { $gt: 0 }
        })
        .sort({ performanceRecordedAt: -1 })
        .limit(limit)
        .exec();
      
      logger.db.query('findWithPredictionAccuracy', this.entityName, Date.now() - startTime, {
        userId,
        workspaceId,
        count: result.length
      });
      
      return result;
    } catch (error) {
      logger.db.error('findWithPredictionAccuracy', error, { userId, workspaceId });
      throw new DatabaseError(
        `Failed to find captions with prediction accuracy for user ${userId}`,
        error as Error
      );
    }
  }

  /**
   * Calculate average performance metrics for a user
   */
  async calculateAverageMetrics(
    userId: string,
    workspaceId: string
  ): Promise<{
    avgLikeRate: number;
    avgCommentRate: number;
    avgSaveRate: number;
    avgShareRate: number;
    sampleSize: number;
  }> {
    const startTime = Date.now();
    try {
      const captions = await this.findPublishedWithPerformance(userId, workspaceId, 50);
      
      if (captions.length === 0) {
        logger.db.query('calculateAverageMetrics', this.entityName, Date.now() - startTime, {
          userId,
          workspaceId,
          sampleSize: 0
        });
        
        return {
          avgLikeRate: 0,
          avgCommentRate: 0,
          avgSaveRate: 0,
          avgShareRate: 0,
          sampleSize: 0
        };
      }

      let totalLikeRate = 0;
      let totalCommentRate = 0;
      let totalSaveRate = 0;
      let totalShareRate = 0;

      for (const caption of captions) {
        if (caption.actualMetrics && caption.actualMetrics.impressions > 0) {
          const impressions = caption.actualMetrics.impressions;
          totalLikeRate += (caption.actualMetrics.likes / impressions) * 100;
          totalCommentRate += (caption.actualMetrics.comments / impressions) * 100;
          totalSaveRate += (caption.actualMetrics.saves / impressions) * 100;
          totalShareRate += (caption.actualMetrics.shares / impressions) * 100;
        }
      }

      const sampleSize = captions.length;
      const avgLikeRate = totalLikeRate / sampleSize;
      const avgCommentRate = totalCommentRate / sampleSize;
      const avgSaveRate = totalSaveRate / sampleSize;
      const avgShareRate = totalShareRate / sampleSize;

      logger.db.query('calculateAverageMetrics', this.entityName, Date.now() - startTime, {
        userId,
        workspaceId,
        sampleSize,
        avgLikeRate: avgLikeRate.toFixed(2)
      });

      return {
        avgLikeRate: Math.round(avgLikeRate * 100) / 100,
        avgCommentRate: Math.round(avgCommentRate * 100) / 100,
        avgSaveRate: Math.round(avgSaveRate * 100) / 100,
        avgShareRate: Math.round(avgShareRate * 100) / 100,
        sampleSize
      };
    } catch (error) {
      logger.db.error('calculateAverageMetrics', error, { userId, workspaceId });
      throw new DatabaseError(
        `Failed to calculate average metrics for user ${userId}`,
        error as Error
      );
    }
  }
}

export const generatedCaptionRepository = new GeneratedCaptionRepository();
