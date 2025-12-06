import { BaseRepository, PaginationOptions } from './BaseRepository';
import { UserContentHistoryModel, IUserContentHistory } from '../models/Content/UserContentHistory';
import { logger } from '../config/logger';
import { DatabaseError } from '../errors';

export class UserContentHistoryRepository extends BaseRepository<IUserContentHistory> {
  constructor() {
    super(UserContentHistoryModel, 'UserContentHistory');
  }

  async findByUserId(userId: string, options?: PaginationOptions) {
    return this.findMany({ userId }, options);
  }

  async findByWorkspaceId(workspaceId: string, options?: PaginationOptions) {
    return this.findMany({ workspaceId }, options);
  }

  async findByAction(action: string, options?: PaginationOptions) {
    return this.findMany({ action }, options);
  }

  async getRecentHistory(userId: string, limit: number = 50): Promise<IUserContentHistory[]> {
    const startTime = Date.now();
    try {
      const result = await this.model
        .find({ userId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .exec();
      logger.db.query('getRecentHistory', this.entityName, Date.now() - startTime, { userId, count: result.length });
      return result;
    } catch (error) {
      logger.db.error('getRecentHistory', error, { entityName: this.entityName, userId });
      throw new DatabaseError('Failed to get recent history', error as Error);
    }
  }
}

export const userContentHistoryRepository = new UserContentHistoryRepository();
