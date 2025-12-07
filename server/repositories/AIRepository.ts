import { BaseRepository, PaginationOptions } from './BaseRepository';
import {
  CreativeBriefModel,
  ICreativeBrief,
  ContentRepurposeModel,
  IContentRepurpose,
  CompetitorAnalysisModel,
  ICompetitorAnalysis,
  FeatureUsageModel,
  IFeatureUsage,
  AIUsageLogModel,
  IAIUsageLog,
} from '../models/AI';
import { logger } from '../config/logger';
import { DatabaseError } from '../errors';

export class CreativeBriefRepository extends BaseRepository<ICreativeBrief> {
  constructor() {
    super(CreativeBriefModel, 'CreativeBrief');
  }

  async createWithDefaults(data: Partial<ICreativeBrief>): Promise<ICreativeBrief> {
    return this.create({
      ...data,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }

  async findByWorkspaceId(workspaceId: string, options?: PaginationOptions) {
    return this.findMany({ workspaceId }, options);
  }

  async findByUserId(userId: string, options?: PaginationOptions) {
    return this.findMany({ userId }, options);
  }

  async findByStatus(status: string, options?: PaginationOptions) {
    return this.findMany({ status }, options);
  }

  async findByIndustry(industry: string, options?: PaginationOptions) {
    return this.findMany({ industry }, options);
  }

  async findDraftBriefs(workspaceId: string): Promise<ICreativeBrief[]> {
    return this.findAll({ workspaceId, status: 'draft' });
  }

  async findCompletedBriefs(workspaceId: string, options?: PaginationOptions) {
    return this.findMany({ workspaceId, status: 'completed' }, options);
  }

  async findByPlatform(workspaceId: string, platform: string): Promise<ICreativeBrief[]> {
    return this.findAll({ workspaceId, platforms: { $in: [platform] } });
  }

  async updateStatus(briefId: string, status: string): Promise<ICreativeBrief | null> {
    return this.updateById(briefId, { status, updatedAt: new Date() });
  }

  async getTotalCreditsUsed(workspaceId: string): Promise<number> {
    const startTime = Date.now();
    try {
      const result = await this.model.aggregate([
        { $match: { workspaceId } },
        { $group: { _id: null, total: { $sum: '$creditsUsed' } } }
      ]).exec();
      logger.db.query('getTotalCreditsUsed', this.entityName, Date.now() - startTime, { workspaceId });
      return result[0]?.total || 0;
    } catch (error) {
      logger.db.error('getTotalCreditsUsed', error, { entityName: this.entityName, workspaceId });
      throw new DatabaseError('Failed to get total credits used', error as Error);
    }
  }
}

export class ContentRepurposeRepository extends BaseRepository<IContentRepurpose> {
  constructor() {
    super(ContentRepurposeModel, 'ContentRepurpose');
  }

  async createWithDefaults(data: Partial<IContentRepurpose>): Promise<IContentRepurpose> {
    return this.create({
      ...data,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }

  async findByWorkspaceId(workspaceId: string, options?: PaginationOptions) {
    return this.findMany({ workspaceId }, options);
  }

  async findByUserId(userId: string, options?: PaginationOptions) {
    return this.findMany({ userId }, options);
  }

  async findByOriginalContentId(originalContentId: string): Promise<IContentRepurpose[]> {
    return this.findAll({ originalContentId });
  }

  async findByPlatform(platform: string, options?: PaginationOptions) {
    return this.findMany({ platform }, options);
  }

  async findByContentType(contentType: string, options?: PaginationOptions) {
    return this.findMany({ contentType }, options);
  }

  async findApprovedRepurposes(workspaceId: string, options?: PaginationOptions) {
    return this.findMany({ workspaceId, isApproved: true }, options);
  }

  async findPendingApproval(workspaceId: string): Promise<IContentRepurpose[]> {
    return this.findAll({ workspaceId, isApproved: false });
  }

  async findByLanguagePair(sourceLanguage: string, targetLanguage: string, options?: PaginationOptions) {
    return this.findMany({ sourceLanguage, targetLanguage }, options);
  }

  async approveRepurpose(repurposeId: string): Promise<IContentRepurpose | null> {
    return this.updateById(repurposeId, { isApproved: true, updatedAt: new Date() });
  }
}

export class CompetitorAnalysisRepository extends BaseRepository<ICompetitorAnalysis> {
  constructor() {
    super(CompetitorAnalysisModel, 'CompetitorAnalysis');
  }

  async createWithDefaults(data: Partial<ICompetitorAnalysis>): Promise<ICompetitorAnalysis> {
    return this.create({
      ...data,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }

  async findByWorkspaceId(workspaceId: string, options?: PaginationOptions) {
    return this.findMany({ workspaceId }, options);
  }

  async findByUserId(userId: string, options?: PaginationOptions) {
    return this.findMany({ userId }, options);
  }

  async findByCompetitorUsername(competitorUsername: string, options?: PaginationOptions) {
    return this.findMany({ competitorUsername }, options);
  }

  async findByPlatform(platform: string, options?: PaginationOptions) {
    return this.findMany({ platform }, options);
  }

  async findByAnalysisType(analysisType: string, options?: PaginationOptions) {
    return this.findMany({ analysisType }, options);
  }

  async findRecentAnalyses(workspaceId: string, limit: number = 10): Promise<ICompetitorAnalysis[]> {
    const startTime = Date.now();
    try {
      const result = await this.model
        .find({ workspaceId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .exec();
      logger.db.query('findRecentAnalyses', this.entityName, Date.now() - startTime, { workspaceId, count: result.length });
      return result;
    } catch (error) {
      logger.db.error('findRecentAnalyses', error, { entityName: this.entityName, workspaceId });
      throw new DatabaseError('Failed to find recent analyses', error as Error);
    }
  }

  async findByWorkspaceAndCompetitor(workspaceId: string, competitorUsername: string, platform: string): Promise<ICompetitorAnalysis | null> {
    return this.findOne({ workspaceId, competitorUsername, platform });
  }

  async updateLastScraped(analysisId: string): Promise<ICompetitorAnalysis | null> {
    return this.updateById(analysisId, { lastScraped: new Date(), updatedAt: new Date() });
  }

  async findStaleAnalyses(daysOld: number = 7): Promise<ICompetitorAnalysis[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    return this.findAll({ lastScraped: { $lte: cutoffDate } });
  }
}

export class FeatureUsageRepository extends BaseRepository<IFeatureUsage> {
  constructor() {
    super(FeatureUsageModel, 'FeatureUsage');
  }

  async createWithDefaults(data: Partial<IFeatureUsage>): Promise<IFeatureUsage> {
    return this.create({
      ...data,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }

  async findByUserId(userId: string, options?: PaginationOptions) {
    return this.findMany({ userId }, options);
  }

  async findByFeatureId(featureId: string, options?: PaginationOptions) {
    return this.findMany({ featureId }, options);
  }

  async findByUserAndFeature(userId: string, featureId: string): Promise<IFeatureUsage | null> {
    return this.findOne({ userId, featureId });
  }

  async incrementUsage(userId: string, featureId: string): Promise<IFeatureUsage> {
    const startTime = Date.now();
    try {
      const result = await this.model.findOneAndUpdate(
        { userId, featureId },
        {
          $inc: { usageCount: 1 },
          $set: { lastUsed: new Date(), updatedAt: new Date() },
          $setOnInsert: { createdAt: new Date() }
        },
        { upsert: true, new: true, runValidators: true }
      ).exec();
      logger.db.query('incrementUsage', this.entityName, Date.now() - startTime, { userId, featureId });
      return result!;
    } catch (error) {
      logger.db.error('incrementUsage', error, { entityName: this.entityName, userId, featureId });
      throw new DatabaseError('Failed to increment feature usage', error as Error);
    }
  }

  async getMostUsedFeatures(limit: number = 10): Promise<Array<{ featureId: string; totalUsage: number }>> {
    const startTime = Date.now();
    try {
      const result = await this.model.aggregate([
        { $group: { _id: '$featureId', totalUsage: { $sum: '$usageCount' } } },
        { $sort: { totalUsage: -1 } },
        { $limit: limit },
        { $project: { featureId: '$_id', totalUsage: 1, _id: 0 } }
      ]).exec();
      logger.db.query('getMostUsedFeatures', this.entityName, Date.now() - startTime);
      return result;
    } catch (error) {
      logger.db.error('getMostUsedFeatures', error, { entityName: this.entityName });
      throw new DatabaseError('Failed to get most used features', error as Error);
    }
  }

  async getUserFeatureStats(userId: string): Promise<Array<{ featureId: string; usageCount: number; lastUsed: Date }>> {
    const startTime = Date.now();
    try {
      const result = await this.model
        .find({ userId })
        .select('featureId usageCount lastUsed')
        .sort({ usageCount: -1 })
        .exec();
      logger.db.query('getUserFeatureStats', this.entityName, Date.now() - startTime, { userId });
      return result.map(r => ({ featureId: r.featureId, usageCount: r.usageCount, lastUsed: r.lastUsed }));
    } catch (error) {
      logger.db.error('getUserFeatureStats', error, { entityName: this.entityName, userId });
      throw new DatabaseError('Failed to get user feature stats', error as Error);
    }
  }
}

export class AIUsageLogRepository extends BaseRepository<IAIUsageLog> {
  constructor() {
    super(AIUsageLogModel, 'AIUsageLog');
  }

  async findByUserId(userId: string, options?: PaginationOptions) {
    return this.findMany({ userId }, options);
  }

  async findByWorkspaceId(workspaceId: string, options?: PaginationOptions) {
    return this.findMany({ workspaceId }, options);
  }

  async findByOperationType(operationType: string, options?: PaginationOptions) {
    return this.findMany({ operationType }, options);
  }

  async findByAiProvider(aiProvider: string, options?: PaginationOptions) {
    return this.findMany({ aiProvider }, options);
  }

  async findSuccessfulOperations(userId: string, options?: PaginationOptions) {
    return this.findMany({ userId, success: true }, options);
  }

  async findFailedOperations(userId: string, options?: PaginationOptions) {
    return this.findMany({ userId, success: false }, options);
  }

  async logUsage(data: {
    userId: string;
    workspaceId?: string;
    operationType: IAIUsageLog['operationType'];
    aiProvider: IAIUsageLog['aiProvider'];
    aiModel?: string;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    creditsUsed: number;
    creditsBefore: number;
    creditsAfter: number;
    requestMetadata?: IAIUsageLog['requestMetadata'];
    success: boolean;
    errorMessage?: string;
    responseTimeMs?: number;
  }): Promise<IAIUsageLog> {
    return this.create({
      ...data,
      createdAt: new Date()
    });
  }

  async getRecentUsage(userId: string, limit: number = 50): Promise<IAIUsageLog[]> {
    const startTime = Date.now();
    try {
      const result = await this.model
        .find({ userId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .exec();
      logger.db.query('getRecentUsage', this.entityName, Date.now() - startTime, { userId, count: result.length });
      return result;
    } catch (error) {
      logger.db.error('getRecentUsage', error, { entityName: this.entityName, userId });
      throw new DatabaseError('Failed to get recent AI usage', error as Error);
    }
  }

  async getTotalCreditsUsedByUser(userId: string): Promise<number> {
    const startTime = Date.now();
    try {
      const result = await this.model.aggregate([
        { $match: { userId, success: true } },
        { $group: { _id: null, total: { $sum: '$creditsUsed' } } }
      ]).exec();
      logger.db.query('getTotalCreditsUsedByUser', this.entityName, Date.now() - startTime, { userId });
      return result[0]?.total || 0;
    } catch (error) {
      logger.db.error('getTotalCreditsUsedByUser', error, { entityName: this.entityName, userId });
      throw new DatabaseError('Failed to get total credits used', error as Error);
    }
  }

  async getUsageStatsByOperationType(userId: string): Promise<Array<{ operationType: string; count: number; totalCredits: number }>> {
    const startTime = Date.now();
    try {
      const result = await this.model.aggregate([
        { $match: { userId, success: true } },
        {
          $group: {
            _id: '$operationType',
            count: { $sum: 1 },
            totalCredits: { $sum: '$creditsUsed' }
          }
        },
        {
          $project: {
            operationType: '$_id',
            count: 1,
            totalCredits: 1,
            _id: 0
          }
        }
      ]).exec();
      logger.db.query('getUsageStatsByOperationType', this.entityName, Date.now() - startTime, { userId });
      return result;
    } catch (error) {
      logger.db.error('getUsageStatsByOperationType', error, { entityName: this.entityName, userId });
      throw new DatabaseError('Failed to get usage stats by operation type', error as Error);
    }
  }

  async getUsageByDateRange(userId: string, startDate: Date, endDate: Date, options?: PaginationOptions) {
    return this.findMany({
      userId,
      createdAt: { $gte: startDate, $lte: endDate }
    }, options);
  }

  async getAverageResponseTime(userId: string, operationType?: string): Promise<number> {
    const startTime = Date.now();
    try {
      const matchQuery: any = { userId, success: true, responseTimeMs: { $exists: true } };
      if (operationType) {
        matchQuery.operationType = operationType;
      }
      
      const result = await this.model.aggregate([
        { $match: matchQuery },
        { $group: { _id: null, avgResponseTime: { $avg: '$responseTimeMs' } } }
      ]).exec();
      logger.db.query('getAverageResponseTime', this.entityName, Date.now() - startTime, { userId });
      return result[0]?.avgResponseTime || 0;
    } catch (error) {
      logger.db.error('getAverageResponseTime', error, { entityName: this.entityName, userId });
      throw new DatabaseError('Failed to get average response time', error as Error);
    }
  }
}

export const creativeBriefRepository = new CreativeBriefRepository();
export const contentRepurposeRepository = new ContentRepurposeRepository();
export const competitorAnalysisRepository = new CompetitorAnalysisRepository();
export const featureUsageRepository = new FeatureUsageRepository();
export const aiUsageLogRepository = new AIUsageLogRepository();
