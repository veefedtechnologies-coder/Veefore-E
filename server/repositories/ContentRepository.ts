import { BaseRepository, PaginationOptions } from './BaseRepository';
import { ContentModel, IContent } from '../models/Content';
import { logger } from '../config/logger';
import { DatabaseError } from '../errors';

export type ContentStatus = 'draft' | 'scheduled' | 'published' | 'failed' | 'archived';

export class ContentRepository extends BaseRepository<IContent> {
  constructor() {
    super(ContentModel, 'Content');
  }

  async findByWorkspaceId(workspaceId: string, options?: PaginationOptions) {
    return this.findMany({ workspaceId }, options);
  }

  async findByWorkspaceAndStatus(
    workspaceId: string,
    status: ContentStatus,
    options?: PaginationOptions
  ) {
    return this.findMany({ workspaceId, status }, options);
  }

  async findByWorkspaceAndType(
    workspaceId: string,
    type: string,
    options?: PaginationOptions
  ) {
    return this.findMany({ workspaceId, type }, options);
  }

  async findScheduledContent(workspaceId?: string): Promise<IContent[]> {
    const filter: any = { status: 'scheduled' };
    if (workspaceId) {
      filter.workspaceId = workspaceId;
    }
    return this.findAll(filter);
  }

  async findDueForPublishing(): Promise<IContent[]> {
    const now = new Date();
    return this.findAll({
      status: 'scheduled',
      scheduledAt: { $lte: now }
    });
  }

  async findUpcomingScheduled(workspaceId: string, limit: number = 10): Promise<IContent[]> {
    const startTime = Date.now();
    try {
      const result = await this.model
        .find({
          workspaceId,
          status: 'scheduled',
          scheduledAt: { $gt: new Date() }
        })
        .sort({ scheduledAt: 1 })
        .limit(limit)
        .exec();
      
      logger.db.query('findUpcomingScheduled', this.entityName, Date.now() - startTime, { workspaceId, limit });
      return result;
    } catch (error) {
      logger.db.error('findUpcomingScheduled', error, { entityName: this.entityName, workspaceId });
      throw new DatabaseError('Failed to find upcoming scheduled content', error as Error);
    }
  }

  async findRecentlyPublished(workspaceId: string, limit: number = 10): Promise<IContent[]> {
    const startTime = Date.now();
    try {
      const result = await this.model
        .find({
          workspaceId,
          status: 'published'
        })
        .sort({ publishedAt: -1 })
        .limit(limit)
        .exec();
      
      logger.db.query('findRecentlyPublished', this.entityName, Date.now() - startTime, { workspaceId, limit });
      return result;
    } catch (error) {
      logger.db.error('findRecentlyPublished', error, { entityName: this.entityName, workspaceId });
      throw new DatabaseError('Failed to find recently published content', error as Error);
    }
  }

  async findDrafts(workspaceId: string, options?: PaginationOptions) {
    return this.findMany({ workspaceId, status: 'draft' }, options);
  }

  async scheduleContent(
    contentId: string,
    scheduledAt: Date,
    platform?: string
  ): Promise<IContent | null> {
    const updateData: any = {
      status: 'scheduled',
      scheduledAt,
      updatedAt: new Date()
    };
    if (platform) {
      updateData.platform = platform;
    }
    return this.updateById(contentId, updateData);
  }

  async markPublished(contentId: string): Promise<IContent | null> {
    return this.updateById(contentId, {
      status: 'published',
      publishedAt: new Date(),
      updatedAt: new Date()
    });
  }

  async markFailed(contentId: string): Promise<IContent | null> {
    return this.updateById(contentId, {
      status: 'failed',
      updatedAt: new Date()
    });
  }

  async archiveContent(contentId: string): Promise<IContent | null> {
    return this.updateById(contentId, {
      status: 'archived',
      updatedAt: new Date()
    });
  }

  async unarchiveContent(contentId: string): Promise<IContent | null> {
    return this.updateById(contentId, {
      status: 'draft',
      updatedAt: new Date()
    });
  }

  async rescheduleContent(contentId: string, newScheduledAt: Date): Promise<IContent | null> {
    return this.updateById(contentId, {
      scheduledAt: newScheduledAt,
      updatedAt: new Date()
    });
  }

  async updateContentData(
    contentId: string,
    contentData: Record<string, any>
  ): Promise<IContent | null> {
    return this.updateById(contentId, {
      contentData,
      updatedAt: new Date()
    });
  }

  async addCreditsUsed(contentId: string, creditsUsed: number): Promise<IContent | null> {
    const startTime = Date.now();
    try {
      const result = await this.model
        .findByIdAndUpdate(
          contentId,
          { $inc: { creditsUsed }, $set: { updatedAt: new Date() } },
          { new: true }
        )
        .exec();
      
      logger.db.query('addCreditsUsed', this.entityName, Date.now() - startTime, { contentId, creditsUsed });
      return result;
    } catch (error) {
      logger.db.error('addCreditsUsed', error, { entityName: this.entityName, contentId });
      throw new DatabaseError('Failed to add credits used', error as Error);
    }
  }

  async countByStatus(workspaceId: string): Promise<Record<string, number>> {
    const startTime = Date.now();
    try {
      const result = await this.model.aggregate([
        { $match: { workspaceId } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]).exec();
      
      const counts: Record<string, number> = {};
      result.forEach((item: { _id: string; count: number }) => {
        counts[item._id] = item.count;
      });
      
      logger.db.query('countByStatus', this.entityName, Date.now() - startTime, { workspaceId });
      return counts;
    } catch (error) {
      logger.db.error('countByStatus', error, { entityName: this.entityName, workspaceId });
      throw new DatabaseError('Failed to count content by status', error as Error);
    }
  }

  async countByType(workspaceId: string): Promise<Record<string, number>> {
    const startTime = Date.now();
    try {
      const result = await this.model.aggregate([
        { $match: { workspaceId } },
        { $group: { _id: '$type', count: { $sum: 1 } } }
      ]).exec();
      
      const counts: Record<string, number> = {};
      result.forEach((item: { _id: string; count: number }) => {
        counts[item._id] = item.count;
      });
      
      logger.db.query('countByType', this.entityName, Date.now() - startTime, { workspaceId });
      return counts;
    } catch (error) {
      logger.db.error('countByType', error, { entityName: this.entityName, workspaceId });
      throw new DatabaseError('Failed to count content by type', error as Error);
    }
  }

  async getTotalCreditsUsed(workspaceId: string): Promise<number> {
    const startTime = Date.now();
    try {
      const result = await this.model.aggregate([
        { $match: { workspaceId } },
        { $group: { _id: null, totalCredits: { $sum: '$creditsUsed' } } }
      ]).exec();
      
      logger.db.query('getTotalCreditsUsed', this.entityName, Date.now() - startTime, { workspaceId });
      return result[0]?.totalCredits || 0;
    } catch (error) {
      logger.db.error('getTotalCreditsUsed', error, { entityName: this.entityName, workspaceId });
      throw new DatabaseError('Failed to get total credits used', error as Error);
    }
  }

  async getContentByDateRange(
    workspaceId: string,
    startDate: Date,
    endDate: Date,
    options?: PaginationOptions
  ) {
    return this.findMany(
      {
        workspaceId,
        createdAt: { $gte: startDate, $lte: endDate }
      },
      options
    );
  }

  async searchContent(workspaceId: string, query: string, options?: PaginationOptions) {
    const searchRegex = new RegExp(query, 'i');
    return this.findMany(
      {
        workspaceId,
        $or: [
          { title: searchRegex },
          { description: searchRegex }
        ]
      },
      options
    );
  }
}

export const contentRepository = new ContentRepository();
