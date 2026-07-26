import { BaseRepository, PaginationOptions } from './BaseRepository';
import { SocialAccountModel, ISocialAccount } from '../models/Social';
import { logger } from '../config/logger';
import { DatabaseError } from '../errors';
import { getAccessTokenFromAccount, getRefreshTokenFromAccount, encryptAndStoreToken } from '../storage/converters';
import { InsertSocialAccount, SocialAccount } from '@shared/schema';
import * as fs from 'fs';
import * as path from 'path';

const traceLog = (msg: string, data?: any) => {
  try {
    const logPath = path.join(process.cwd(), 'debug-trace.log');
    const timestamp = new Date().toISOString();
    const entry = `[${timestamp}] [REPO] ${msg}${data ? ' ' + JSON.stringify(data) : ''}\n`;
    fs.appendFileSync(logPath, entry);
  } catch (e) {
    console.error('Failed to log to trace file', e);
  }
};

export type Platform = 'instagram' | 'instagram_advanced' | 'twitter' | 'facebook' | 'youtube' | 'tiktok' | 'linkedin';

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
      traceLog('createWithEncryptedTokens called', { workspace: account.workspaceId, hasToken: !!account.accessToken });
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
        traceLog('Encrypting new accessToken', { len: account.accessToken.length });
        socialAccountData.encryptedAccessToken = encryptAndStoreToken(account.accessToken);
        socialAccountData.accessToken = null; // P4-FIX: Explicitly nullify to clear stale plain field
      }

      if (account.refreshToken) {
        socialAccountData.encryptedRefreshToken = encryptAndStoreToken(account.refreshToken);
        socialAccountData.refreshToken = null; // P4-FIX: Explicitly nullify
      }

      const result = await this.create(socialAccountData);
      traceLog('Create complete', { id: result._id?.toString() });
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
      traceLog(`updateWithEncryptedTokens called for ${id}`, { hasToken: !!updates.accessToken });
      const encryptedUpdates: any = { ...updates, updatedAt: new Date() };

      if (updates.accessToken) {
        traceLog('Encrypting updated accessToken', { len: updates.accessToken.length });
        encryptedUpdates.encryptedAccessToken = encryptAndStoreToken(updates.accessToken);
        encryptedUpdates.accessToken = null; // P4-FIX: Explicitly nullify to clear stale plain field
      }

      if (updates.refreshToken) {
        encryptedUpdates.encryptedRefreshToken = encryptAndStoreToken(updates.refreshToken);
        encryptedUpdates.refreshToken = null; // P4-FIX: Explicitly nullify
      }

      traceLog('Calling updateById', { id, updateKeys: Object.keys(encryptedUpdates) });
      const result = await this.updateById(id, encryptedUpdates);

      if (!result) {
        traceLog('Update failed: Account not found', { id });
        throw new Error('Social account not found');
      }

      traceLog('Update successful', { id: result._id?.toString() });
      logger.db.query('updateWithEncryptedTokens', this.entityName, Date.now() - startTime, { id });
      return result;
    } catch (error) {
      traceLog('Update error', { error: (error as Error).message });
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
    // Search by accountId only — not restricted to instagram platform so that
    // Facebook Pages (whose pageId is stored in the accountId field) are also
    // found when the BullMQ worker resolves an external account ID.
    return this.findOne({ accountId: instagramAccountId });
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
      accountReach?: number;
      totalViews?: number;
      totalSaves?: number;
      totalShares?: number;
      audienceCity?: Map<string, number> | Record<string, number>;
      audienceCountry?: Map<string, number> | Record<string, number>;
      audienceGenderAge?: Map<string, number> | Record<string, number>;
      audienceActiveTime?: Map<string, number> | Record<string, number>;
      audienceActiveTimeWeekly?: Map<string, number> | Record<string, number>;
      demographicsLastFetched?: Date;
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
    console.log(`[SocialAccountRepository] Disconnecting account ${accountId}`);
    try {
      const result = await this.updateById(accountId, {
        isActive: false,
        accessToken: null,
        refreshToken: null,
        encryptedAccessToken: null,
        encryptedRefreshToken: null,
        tokenStatus: 'disconnected',
        updatedAt: new Date()
      });
      console.log(`[SocialAccountRepository] Account ${accountId} disconnected successfully`);
      return result;
    } catch (error) {
      console.error(`[SocialAccountRepository] Error disconnecting account ${accountId}`, error);
      throw error;
    }
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

      // P1-FIX: Removed prefix-based lookup logic that was causing cross-workspace data leakage
      // and "tolerant" lookups that matched multiple workspaces.
      const accounts = await this.model.find({ workspaceId: workspaceIdStr }).exec();

      logger.db.query('findByWorkspaceWithTolerantLookup', this.entityName, Date.now() - startTime, { workspaceId: workspaceIdStr });
      return accounts;
    } catch (error) {
      logger.db.error('findByWorkspaceWithTolerantLookup', error, { entityName: this.entityName, workspaceId });
      throw new DatabaseError('Failed to find accounts', error as Error);
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
        id: (account._id as any).toString(),
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

  /**
   * Set the `connectionStatus` field on a SocialAccount by its document `_id`.
   *
   * Used by error-handling paths (e.g. `FacebookRollupReadStore`) to mark an
   * account as `REQUIRES_RECONNECT` immediately when a TOKEN_EXPIRED error is
   * received from the Facebook Graph API, and to restore it to `ACTIVE` after a
   * successful reconnection.
   *
   * The method also marks `isActive: false` when the new status is
   * `REQUIRES_RECONNECT` or `DISCONNECTED` so the account is excluded from
   * future `findActiveByWorkspace` queries until it is reconnected.
   *
   * Requirements: 12.2
   */
  async setConnectionStatus(
    accountId: string,
    status: 'ACTIVE' | 'DISCONNECTED' | 'REQUIRES_RECONNECT' | 'SYNCING'
  ): Promise<ISocialAccount | null> {
    const startTime = Date.now();
    try {
      const isActive = status === 'ACTIVE' || status === 'SYNCING';
      const result = await this.updateById(accountId, {
        connectionStatus: status,
        isActive,
        updatedAt: new Date(),
      });

      logger.db.query('setConnectionStatus', this.entityName, Date.now() - startTime, {
        accountId,
        status,
      });
      return result;
    } catch (error) {
      logger.db.error('setConnectionStatus', error, { entityName: this.entityName, accountId, status });
      throw new DatabaseError('Failed to set connection status', error as Error);
    }
  }

  /**
   * Find Facebook SocialAccounts whose `tokenExpiresAt` is within the next
   * `daysAhead` days. Used by the token-refresh job to proactively refresh
   * tokens before they expire.
   *
   * Only returns ACTIVE accounts — REQUIRES_RECONNECT / DISCONNECTED accounts
   * are excluded because the user must manually reconnect them.
   *
   * Requirements: 2.10, 2.11
   */
  async findExpiringFacebook(daysAhead: number): Promise<ISocialAccount[]> {
    const startTime = Date.now();
    try {
      const now = new Date();
      const cutoff = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

      const accounts = await this.model.find({
        platform: 'facebook',
        connectionStatus: 'ACTIVE',
        tokenExpiresAt: {
          $gt: now,       // not already expired
          $lte: cutoff,   // expires within daysAhead days
        },
      }).exec();

      logger.db.query('findExpiringFacebook', this.entityName, Date.now() - startTime, {
        daysAhead,
        count: accounts.length,
      });
      return accounts;
    } catch (error) {
      logger.db.error('findExpiringFacebook', error, { entityName: this.entityName, daysAhead });
      throw new DatabaseError('Failed to find expiring Facebook accounts', error as Error);
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

  async updateYouTubePlatformData(accountId: string, updates: {
    workspaceId?: string;
    subscriberCount?: number;
    videoCount?: number;
    viewCount?: number;
    lastSync?: Date;
    updatedAt?: Date;
  }): Promise<any> {
    const startTime = Date.now();
    try {
      // P1-FIX: Changed from global updateMany to account-scoped updateOne
      const result = await this.model.updateOne(
        { accountId: accountId, platform: 'youtube' },
        {
          $set: {
            subscriberCount: updates.subscriberCount,
            videoCount: updates.videoCount,
            viewCount: updates.viewCount,
            lastSync: updates.lastSync,
            updatedAt: updates.updatedAt || new Date()
          }
        }
      ).exec();

      logger.db.query('updateYouTubePlatformData', this.entityName, Date.now() - startTime, { accountId });
      return result;
    } catch (error) {
      logger.db.error('updateYouTubePlatformData', error, { entityName: this.entityName, accountId });
      throw new DatabaseError('Failed to update YouTube platform data', error as Error);
    }
  }
}

export const socialAccountRepository = new SocialAccountRepository();
