import { BaseRepository, PaginationOptions } from './BaseRepository';
import { SocialAccountModel, ISocialAccount } from '../models/Social';
import { logger } from '../config/logger';
import { DatabaseError } from '../errors';
import { getAccessTokenFromAccount, getRefreshTokenFromAccount, encryptAndStoreToken } from '../storage/converters';
import { InsertSocialAccount, SocialAccount } from '@shared/schema';

export type Platform = 'instagram' | 'twitter' | 'facebook' | 'youtube' | 'tiktok' | 'linkedin';

export interface SocialAccountWithDecryptedTokens {
  id: string;
  workspaceId: any;
  platform: string;
  username: string;
  accountId?: string;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt?: Date;
  isActive?: boolean;
  followersCount?: number;
  mediaCount?: number;
  profilePictureUrl?: string;
  lastSyncAt?: Date;
}

export class SocialAccountRepository extends BaseRepository<ISocialAccount> {
  constructor() {
    super(SocialAccountModel, 'SocialAccount');
  }

  async findByWorkspaceId(workspaceId: string): Promise<ISocialAccount[]> {
    return this.findAll({ workspaceId });
  }

  async createWithEncryptedTokens(account: InsertSocialAccount): Promise<ISocialAccount> {
    const startTime = Date.now();
    try {
      const socialAccountData: any = {
        ...account,
        isActive: true,
        totalShares: 0,
        totalSaves: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      delete socialAccountData.id;
      delete socialAccountData._id;

      if (account.accessToken) {
        socialAccountData.encryptedAccessToken = encryptAndStoreToken(account.accessToken);
        delete socialAccountData.accessToken;
      }

      if (account.refreshToken) {
        socialAccountData.encryptedRefreshToken = encryptAndStoreToken(account.refreshToken);
        delete socialAccountData.refreshToken;
      }

      const result = await this.create(socialAccountData);
      logger.db.query('createWithEncryptedTokens', this.entityName, Date.now() - startTime);
      return result;
    } catch (error) {
      logger.db.error('createWithEncryptedTokens', error, { entityName: this.entityName });
      throw new DatabaseError('Failed to create social account with encrypted tokens', error as Error);
    }
  }

  async updateWithEncryptedTokens(id: string, updates: Partial<SocialAccount>): Promise<ISocialAccount> {
    const startTime = Date.now();
    try {
      const encryptedUpdates: any = { ...updates, updatedAt: new Date() };

      if (updates.accessToken) {
        encryptedUpdates.encryptedAccessToken = encryptAndStoreToken(updates.accessToken);
        delete encryptedUpdates.accessToken;
      }

      if (updates.refreshToken) {
        encryptedUpdates.encryptedRefreshToken = encryptAndStoreToken(updates.refreshToken);
        delete encryptedUpdates.refreshToken;
      }

      const result = await this.updateById(id, encryptedUpdates);
      
      if (!result) {
        throw new Error('Social account not found');
      }

      logger.db.query('updateWithEncryptedTokens', this.entityName, Date.now() - startTime, { id });
      return result;
    } catch (error) {
      logger.db.error('updateWithEncryptedTokens', error, { entityName: this.entityName, id });
      throw new DatabaseError('Failed to update social account with encrypted tokens', error as Error);
    }
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

  async findByWorkspaceWithTolerantLookup(workspaceId: string): Promise<ISocialAccount[]> {
    const startTime = Date.now();
    try {
      const workspaceIdStr = workspaceId.toString();
      const workspaceIdFirst6 = workspaceIdStr.substring(0, 6);
      
      const accounts = await this.model.find({
        $or: [
          { workspaceId: workspaceIdStr },
          { workspaceId: workspaceId },
          { workspaceId: workspaceIdFirst6 },
          { workspaceId: parseInt(workspaceIdFirst6) }
        ]
      }).exec();
      
      for (const account of accounts) {
        const accountWorkspaceId = account.workspaceId?.toString() || '';
        const expectedWorkspaceId = workspaceIdStr;
        
        if (accountWorkspaceId !== expectedWorkspaceId &&
            (accountWorkspaceId === workspaceIdFirst6 ||
             accountWorkspaceId === parseInt(workspaceIdFirst6).toString())) {
          await this.model.updateOne(
            { _id: account._id },
            { workspaceId: expectedWorkspaceId, updatedAt: new Date() }
          );
          account.workspaceId = expectedWorkspaceId;
        }
      }
      
      logger.db.query('findByWorkspaceWithTolerantLookup', this.entityName, Date.now() - startTime, { workspaceId });
      return accounts;
    } catch (error) {
      logger.db.error('findByWorkspaceWithTolerantLookup', error, { entityName: this.entityName, workspaceId });
      throw new DatabaseError('Failed to find accounts with tolerant lookup', error as Error);
    }
  }

  async findActiveWithDecryptedTokens(workspaceId: string): Promise<SocialAccountWithDecryptedTokens[]> {
    const startTime = Date.now();
    try {
      const accounts = await this.model.find({
        workspaceId: workspaceId.toString(),
        isActive: true
      }).exec();
      
      const result = accounts.map(account => ({
        id: account._id.toString(),
        workspaceId: account.workspaceId,
        platform: account.platform,
        username: account.username,
        accountId: account.accountId,
        accessToken: getAccessTokenFromAccount(account),
        refreshToken: getRefreshTokenFromAccount(account),
        expiresAt: account.expiresAt,
        isActive: account.isActive,
        followersCount: account.followersCount,
        mediaCount: account.mediaCount,
        profilePictureUrl: account.profilePictureUrl,
        lastSyncAt: account.lastSyncAt
      }));
      
      logger.db.query('findActiveWithDecryptedTokens', this.entityName, Date.now() - startTime, { workspaceId });
      return result;
    } catch (error) {
      logger.db.error('findActiveWithDecryptedTokens', error, { entityName: this.entityName, workspaceId });
      throw new DatabaseError('Failed to find accounts with decrypted tokens', error as Error);
    }
  }

  async findByPageIdOrAccountId(pageId: string): Promise<ISocialAccount | null> {
    const startTime = Date.now();
    try {
      let account = await this.model.findOne({ 
        pageId: pageId,
        platform: 'instagram',
        isActive: true 
      }).exec();
      
      if (!account) {
        account = await this.model.findOne({ 
          accountId: pageId,
          platform: 'instagram',
          isActive: true 
        }).exec();
      }
      
      logger.db.query('findByPageIdOrAccountId', this.entityName, Date.now() - startTime, { pageId });
      return account;
    } catch (error) {
      logger.db.error('findByPageIdOrAccountId', error, { entityName: this.entityName, pageId });
      throw new DatabaseError('Failed to find account by page ID or account ID', error as Error);
    }
  }

  async findByWorkspaceIds(
    workspaceIds: string[], 
    options?: { 
      activeOnly?: boolean; 
      projection?: Record<string, 0 | 1>;
    }
  ): Promise<ISocialAccount[]> {
    const startTime = Date.now();
    try {
      const query: Record<string, any> = { workspaceId: { $in: workspaceIds } };
      
      if (options?.activeOnly) {
        query.isActive = true;
      }

      const queryBuilder = this.model.find(query);
      
      if (options?.projection) {
        queryBuilder.select(options.projection);
      }

      const accounts = await queryBuilder.lean().exec();
      
      logger.db.query('findByWorkspaceIds', this.entityName, Date.now() - startTime, { 
        workspaceIdsCount: workspaceIds.length,
        activeOnly: options?.activeOnly,
        hasProjection: !!options?.projection
      });
      return accounts as ISocialAccount[];
    } catch (error) {
      logger.db.error('findByWorkspaceIds', error, { entityName: this.entityName });
      throw new DatabaseError('Failed to find accounts by workspace IDs', error as Error);
    }
  }

  async updateYouTubePlatformData(updates: {
    workspaceId?: string;
    subscriberCount?: number;
    videoCount?: number;
    viewCount?: number;
    lastSync?: Date;
    updatedAt?: Date;
  }): Promise<any> {
    const startTime = Date.now();
    try {
      const result = await this.model.updateMany(
        { platform: 'youtube' },
        {
          $set: {
            workspaceId: updates.workspaceId,
            subscriberCount: updates.subscriberCount,
            videoCount: updates.videoCount,
            viewCount: updates.viewCount,
            lastSync: updates.lastSync,
            updatedAt: updates.updatedAt || new Date()
          }
        }
      ).exec();
      
      logger.db.query('updateYouTubePlatformData', this.entityName, Date.now() - startTime);
      return result;
    } catch (error) {
      logger.db.error('updateYouTubePlatformData', error, { entityName: this.entityName });
      throw new DatabaseError('Failed to update YouTube platform data', error as Error);
    }
  }
}

export const socialAccountRepository = new SocialAccountRepository();
