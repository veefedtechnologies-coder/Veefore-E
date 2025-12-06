import { BaseService } from './BaseService';
import { socialAccountRepository, Platform } from '../repositories';
import { ISocialAccount } from '../models/Social';
import { NotFoundError, ValidationError, ConflictError } from '../errors';

interface ConnectAccountInput {
  workspaceId: string;
  platform: Platform;
  username: string;
  accountId: string;
  accessToken?: string;
  refreshToken?: string;
  encryptedAccessToken?: any;
  encryptedRefreshToken?: any;
  expiresAt?: Date;
  profileData?: {
    biography?: string;
    website?: string;
    profilePictureUrl?: string;
    followersCount?: number;
    followingCount?: number;
    mediaCount?: number;
    isBusinessAccount?: boolean;
    isVerified?: boolean;
  };
}

interface UpdateMetricsInput {
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

export class SocialAccountService extends BaseService {
  constructor() {
    super('SocialAccountService');
  }

  async getAccountById(accountId: string): Promise<ISocialAccount> {
    return this.withErrorHandling('getAccountById', async () => {
      const account = await socialAccountRepository.findById(accountId);
      if (!account) {
        throw new NotFoundError('SocialAccount', accountId);
      }
      return account;
    });
  }

  async getAccountsByWorkspace(workspaceId: string): Promise<ISocialAccount[]> {
    return this.withErrorHandling('getAccountsByWorkspace', async () => {
      return socialAccountRepository.findByWorkspaceId(workspaceId);
    });
  }

  async getActiveAccountsByWorkspace(workspaceId: string): Promise<ISocialAccount[]> {
    return this.withErrorHandling('getActiveAccountsByWorkspace', async () => {
      return socialAccountRepository.findActiveByWorkspace(workspaceId);
    });
  }

  async getAccountByPlatform(
    workspaceId: string,
    platform: Platform
  ): Promise<ISocialAccount | null> {
    return this.withErrorHandling('getAccountByPlatform', async () => {
      return socialAccountRepository.findByWorkspaceAndPlatform(workspaceId, platform);
    });
  }

  async connectAccount(input: ConnectAccountInput): Promise<ISocialAccount> {
    return this.withErrorHandling('connectAccount', async () => {
      const existing = await socialAccountRepository.findByWorkspaceAndPlatform(
        input.workspaceId,
        input.platform
      );

      if (existing) {
        const updated = await socialAccountRepository.updateById((existing._id as any).toString(), {
          username: input.username,
          accountId: input.accountId,
          accessToken: input.accessToken,
          refreshToken: input.refreshToken,
          encryptedAccessToken: input.encryptedAccessToken,
          encryptedRefreshToken: input.encryptedRefreshToken,
          expiresAt: input.expiresAt,
          tokenStatus: 'valid',
          isActive: true,
          ...input.profileData,
          lastSyncAt: new Date(),
          updatedAt: new Date()
        });
        
        this.log('connectAccount', 'Account reconnected', {
          accountId: existing._id,
          platform: input.platform
        });
        return updated!;
      }

      const account = await socialAccountRepository.create({
        workspaceId: input.workspaceId,
        platform: input.platform,
        username: input.username,
        accountId: input.accountId,
        accessToken: input.accessToken,
        refreshToken: input.refreshToken,
        encryptedAccessToken: input.encryptedAccessToken,
        encryptedRefreshToken: input.encryptedRefreshToken,
        expiresAt: input.expiresAt,
        tokenStatus: 'valid',
        isActive: true,
        ...input.profileData,
        lastSyncAt: new Date()
      });

      this.log('connectAccount', 'Account connected', {
        accountId: account._id,
        platform: input.platform,
        workspaceId: input.workspaceId
      });
      return account;
    });
  }

  async disconnectAccount(accountId: string): Promise<void> {
    return this.withErrorHandling('disconnectAccount', async () => {
      const account = await this.getAccountById(accountId);
      await socialAccountRepository.disconnectAccount(accountId);
      this.log('disconnectAccount', 'Account disconnected', {
        accountId,
        platform: account.platform
      });
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
    }
  ): Promise<ISocialAccount> {
    return this.withErrorHandling('updateTokens', async () => {
      const updated = await socialAccountRepository.updateTokens(accountId, {
        ...tokens,
        tokenStatus: 'valid'
      });
      if (!updated) {
        throw new NotFoundError('SocialAccount', accountId);
      }
      this.log('updateTokens', 'Tokens updated', { accountId });
      return updated;
    });
  }

  async updateMetrics(accountId: string, metrics: UpdateMetricsInput): Promise<ISocialAccount> {
    return this.withErrorHandling('updateMetrics', async () => {
      const updated = await socialAccountRepository.updateMetrics(accountId, metrics);
      if (!updated) {
        throw new NotFoundError('SocialAccount', accountId);
      }
      return updated;
    });
  }

  async markSynced(accountId: string): Promise<ISocialAccount> {
    return this.withErrorHandling('markSynced', async () => {
      const updated = await socialAccountRepository.markSynced(accountId);
      if (!updated) {
        throw new NotFoundError('SocialAccount', accountId);
      }
      return updated;
    });
  }

  async setTokenStatus(accountId: string, status: string): Promise<ISocialAccount> {
    return this.withErrorHandling('setTokenStatus', async () => {
      const updated = await socialAccountRepository.setTokenStatus(accountId, status);
      if (!updated) {
        throw new NotFoundError('SocialAccount', accountId);
      }
      this.log('setTokenStatus', 'Token status updated', { accountId, status });
      return updated;
    });
  }

  async getAccountsNeedingSync(olderThanHours: number = 24): Promise<ISocialAccount[]> {
    return this.withErrorHandling('getAccountsNeedingSync', async () => {
      return socialAccountRepository.findAccountsNeedingSync(olderThanHours);
    });
  }

  async getAccountsWithExpiredTokens(): Promise<ISocialAccount[]> {
    return this.withErrorHandling('getAccountsWithExpiredTokens', async () => {
      return socialAccountRepository.findAccountsWithExpiredTokens();
    });
  }

  async getTotalFollowers(workspaceId: string): Promise<number> {
    return this.withErrorHandling('getTotalFollowers', async () => {
      return socialAccountRepository.getTotalFollowersByWorkspace(workspaceId);
    });
  }

  async getAccountStats(): Promise<{
    totalAccounts: number;
    activeAccounts: number;
    byPlatform: Record<string, number>;
  }> {
    return this.withErrorHandling('getAccountStats', async () => {
      const [total, byPlatform] = await Promise.all([
        socialAccountRepository.count(),
        socialAccountRepository.countByPlatform()
      ]);

      const activeCount = Object.values(byPlatform).reduce((a, b) => a + b, 0);

      return {
        totalAccounts: total,
        activeAccounts: activeCount,
        byPlatform
      };
    });
  }

  async findByInstagramAccountId(instagramAccountId: string): Promise<ISocialAccount | null> {
    return this.withErrorHandling('findByInstagramAccountId', async () => {
      return socialAccountRepository.findByInstagramAccountId(instagramAccountId);
    });
  }
}

export const socialAccountService = new SocialAccountService();
