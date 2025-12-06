import { BaseRepository, PaginationOptions } from './BaseRepository';
import { SocialAccountModel, ISocialAccount } from '../models/Social';
import { logger } from '../config/logger';
import { DatabaseError } from '../errors';

export type Platform = 'instagram' | 'twitter' | 'facebook' | 'youtube' | 'tiktok' | 'linkedin';

export class SocialAccountRepository extends BaseRepository<ISocialAccount> {
  constructor() {
    super(SocialAccountModel, 'SocialAccount');
  }

  async findByWorkspaceId(workspaceId: string): Promise<ISocialAccount[]> {
    return this.findAll({ workspaceId });
  }

  async findByWorkspaceAndPlatform(
    workspaceId: string,
    platform: Platform
  ): Promise<ISocialAccount | null> {
    return this.findOne({ workspaceId, platform });
  }

  async findByAccountId(accountId: string): Promise<ISocialAccount | null> {
    return this.findOne({ accountId });
  }

  async findByInstagramAccountId(instagramAccountId: string): Promise<ISocialAccount | null> {
    return this.findOne({ accountId: instagramAccountId, platform: 'instagram' });
  }

  async findActiveByWorkspace(workspaceId: string): Promise<ISocialAccount[]> {
    return this.findAll({ workspaceId, isActive: true });
  }

  async findByPlatform(platform: Platform, options?: PaginationOptions) {
    return this.findMany({ platform }, options);
  }

  async findAccountsNeedingSync(olderThanHours: number = 24): Promise<ISocialAccount[]> {
    const threshold = new Date();
    threshold.setHours(threshold.getHours() - olderThanHours);
    
    return this.findAll({
      isActive: true,
      $or: [
        { lastSyncAt: { $lt: threshold } },
        { lastSyncAt: { $exists: false } }
      ]
    });
  }

  async findAccountsWithExpiredTokens(): Promise<ISocialAccount[]> {
    return this.findAll({
      isActive: true,
      expiresAt: { $lte: new Date() }
    });
  }

  async findAccountsWithValidTokens(): Promise<ISocialAccount[]> {
    return this.findAll({
      isActive: true,
      tokenStatus: 'valid',
      $or: [
        { expiresAt: { $gt: new Date() } },
        { expiresAt: { $exists: false } }
      ]
    });
  }

  async updateTokens(
    accountId: string,
    tokens: {
      accessToken?: string;
      refreshToken?: string;
      encryptedAccessToken?: any;
      encryptedRefreshToken?: any;
      expiresAt?: Date;
      tokenStatus?: string;
    }
  ): Promise<ISocialAccount | null> {
    return this.updateById(accountId, {
      ...tokens,
      updatedAt: new Date()
    });
  }

  async updateMetrics(
    accountId: string,
    metrics: {
      followersCount?: number;
      followingCount?: number;
      mediaCount?: number;
      avgLikes?: number;
      avgComments?: number;
      avgReach?: number;
      engagementRate?: number;
      totalLikes?: number;
      totalComments?: number;
      totalReach?: number;
    }
  ): Promise<ISocialAccount | null> {
    return this.updateById(accountId, {
      ...metrics,
      lastSyncAt: new Date(),
      updatedAt: new Date()
    });
  }

  async markSynced(accountId: string): Promise<ISocialAccount | null> {
    return this.updateById(accountId, {
      lastSyncAt: new Date(),
      updatedAt: new Date()
    });
  }

  async setActive(accountId: string, isActive: boolean): Promise<ISocialAccount | null> {
    return this.updateById(accountId, {
      isActive,
      updatedAt: new Date()
    });
  }

  async setTokenStatus(accountId: string, tokenStatus: string): Promise<ISocialAccount | null> {
    return this.updateById(accountId, {
      tokenStatus,
      updatedAt: new Date()
    });
  }

  async disconnectAccount(accountId: string): Promise<ISocialAccount | null> {
    return this.updateById(accountId, {
      isActive: false,
      accessToken: null,
      refreshToken: null,
      encryptedAccessToken: null,
      encryptedRefreshToken: null,
      tokenStatus: 'disconnected',
      updatedAt: new Date()
    });
  }

  async getAccountsByWorkspaceWithMetrics(workspaceId: string): Promise<ISocialAccount[]> {
    return this.findAll({
      workspaceId,
      isActive: true
    });
  }

  async countByPlatform(): Promise<Record<string, number>> {
    const startTime = Date.now();
    try {
      const result = await this.model.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$platform', count: { $sum: 1 } } }
      ]).exec();
      
      const counts: Record<string, number> = {};
      result.forEach((item: { _id: string; count: number }) => {
        counts[item._id] = item.count;
      });
      
      logger.db.query('countByPlatform', this.entityName, Date.now() - startTime);
      return counts;
    } catch (error) {
      logger.db.error('countByPlatform', error, { entityName: this.entityName });
      throw new DatabaseError('Failed to count accounts by platform', error as Error);
    }
  }

  async getTotalFollowersByWorkspace(workspaceId: string): Promise<number> {
    const startTime = Date.now();
    try {
      const result = await this.model.aggregate([
        { $match: { workspaceId, isActive: true } },
        { $group: { _id: null, totalFollowers: { $sum: '$followersCount' } } }
      ]).exec();
      
      logger.db.query('getTotalFollowersByWorkspace', this.entityName, Date.now() - startTime, { workspaceId });
      return result[0]?.totalFollowers || 0;
    } catch (error) {
      logger.db.error('getTotalFollowersByWorkspace', error, { entityName: this.entityName, workspaceId });
      throw new DatabaseError('Failed to get total followers', error as Error);
    }
  }
}

export const socialAccountRepository = new SocialAccountRepository();
