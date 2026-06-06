import { BaseService } from './BaseService';
import { socialAccountRepository, Platform } from '../repositories';
import { ISocialAccount } from '../models/Social';
import { NotFoundError, ValidationError, ConflictError } from '../errors';
import InstagramApiService from './instagramApi';
import BestActiveTimeService from './bestActiveTime';
import { getAccessTokenFromAccount } from '../storage/converters';
import * as fs from 'fs';
import * as path from 'path';
import { checkInstagramAccountExists, validateInstagramConnection } from '../utils/instagram-validation';
import { MongoStorage } from '../mongodb-storage';
import { InstagramOAuthService } from '../instagram-oauth';
import { MetricsQueueManager } from '../queues/metricsQueue';

const traceLog = (msg: string, data?: any) => {
  try {
    const logPath = path.join(process.cwd(), 'debug-trace.log');
    const timestamp = new Date().toISOString();
    const entry = `[${timestamp}] [SERVICE] ${msg}${data ? ' ' + JSON.stringify(data) : ''}\n`;
    fs.appendFileSync(logPath, entry);
  } catch (e) {
    console.error('Failed to log to trace file', e);
  }
};

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
      // Use tolerant lookup to handle ObjectId vs String mismatches (P1-5 FIX)
      return socialAccountRepository.findByWorkspaceWithTolerantLookup(workspaceId);
    });
  }

  async getActiveAccountsByWorkspace(workspaceId: string): Promise<ISocialAccount[]> {
    return this.withErrorHandling('getActiveAccountsByWorkspace', async () => {
      // Use tolerant lookup and filter active ones (P1-5 FIX)
      const accounts = await socialAccountRepository.findByWorkspaceWithTolerantLookup(workspaceId);
      return accounts.filter(a => a.isActive);
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

  async connectAccount(input: ConnectAccountInput): Promise<ISocialAccount | { url: string }> {
    return this.withErrorHandling('connectAccount', async () => {
      // If only platform is provided, return OAuth URL
      if (!input.username && !input.accountId) {
        return { url: this.getOAuthUrl(input.platform, input.workspaceId) };
      }

      // P1-FIX: Search for existing account by accountId (if provided) and platform
      // to ensure we don't accidentally "move" accounts between workspaces.
      let existing: ISocialAccount | null = null;
      if (input.accountId) {
        existing = await socialAccountRepository.findOne({
          accountId: input.accountId,
          platform: input.platform
        });
      } else {
        // Fallback to username if accountId isn't available yet (unlikely for final storage)
        existing = await socialAccountRepository.findOne({
          username: input.username,
          platform: input.platform,
          workspaceId: input.workspaceId
        });
      }

      // P3-RESTRICTION: If account exists in a DIFFERENT workspace, block it.
      if (existing && existing.workspaceId.toString() !== input.workspaceId.toString()) {
        traceLog(`Block connection: ${input.username} already in workspace ${existing.workspaceId}`);
        throw new ConflictError(`Account @${input.username} is already connected to another workspace. Please disconnect it there first.`);
      }

      const accountData = {
        workspaceId: input.workspaceId,
        username: input.username,
        accountId: input.accountId,
        accessToken: input.accessToken,
        refreshToken: input.refreshToken,
        expiresAt: input.expiresAt,
        tokenStatus: 'valid' as const,
        isActive: true,
        biography: input.profileData?.biography,
        website: input.profileData?.website,
        profilePictureUrl: input.profileData?.profilePictureUrl,
        followersCount: input.profileData?.followersCount,
        followingCount: input.profileData?.followingCount,
        mediaCount: input.profileData?.mediaCount,
        isBusinessAccount: input.profileData?.isBusinessAccount,
        lastSyncAt: new Date()
      };

      if (existing) {
        const existingId = (existing._id as any).toString();
        traceLog(`Updating existing account ${existingId} for workspace ${input.workspaceId}`);
        const updated = await socialAccountRepository.updateWithEncryptedTokens(existingId, accountData as any);
        traceLog('Update complete', { id: existingId });
        return updated!;
      }

      traceLog('Creating new account', { workspace: input.workspaceId, platform: input.platform });
      const account = await socialAccountRepository.createWithEncryptedTokens({
        workspaceId: input.workspaceId,
        platform: input.platform,
        username: input.username,
        accountId: input.accountId,
        accessToken: input.accessToken,
        refreshToken: input.refreshToken,
        expiresAt: input.expiresAt,
        tokenStatus: 'valid',
        isActive: true,
        biography: input.profileData?.biography,
        website: input.profileData?.website,
        profilePictureUrl: input.profileData?.profilePictureUrl,
        followersCount: input.profileData?.followersCount,
        followingCount: input.profileData?.followingCount,
        mediaCount: input.profileData?.mediaCount,
        isBusinessAccount: input.profileData?.isBusinessAccount,
        lastSyncAt: new Date()
      } as any);

      this.log('connectAccount', 'Account connected', {
        accountId: account._id,
        platform: input.platform,
        workspaceId: input.workspaceId
      });
      traceLog('New account created', { id: account._id?.toString() });

      // PHASE 4: Hook up BullMQ smart polling automatically
      if (input.platform === 'instagram' || input.platform === 'instagram_advanced') {
        const tokenToUse = input.accessToken || account.accessToken;
        const instAccountId = input.accountId || account.accountId;
        if (tokenToUse && instAccountId) {
          // Fire and forget - schedule the background jobs
          MetricsQueueManager.scheduleSmartPolling(
            input.workspaceId.toString(),
            'system', // UserId not strictly required for backend polling
            instAccountId,
            tokenToUse,
            'medium'
          ).catch(err => {
            console.error('Failed to schedule smart polling on connect:', err);
          });
        }
      }

      return account;
    });
  }

  private getOAuthUrl(platform: Platform, workspaceId: string): string {
    // P3-FIX: Delegate to dedicated InstagramOAuthService to ensure Ngrok and Business Login logic is applied
    if (platform === 'instagram' || platform === 'instagram_advanced') {
      const storage = new MongoStorage();
      const instagramService = new InstagramOAuthService(storage as any);

      return platform === 'instagram_advanced'
        ? instagramService.getAdvancedAuthUrl(workspaceId)
        : instagramService.getAuthUrl(workspaceId);
    }

    const authBaseUrl = process.env.SOCIAL_AUTH_BASE_URL || process.env.BASE_URL || 'http://localhost:3000';
    const redirectUri = `${authBaseUrl}/api/v1/social-auth/${platform}/callback`;

    switch (platform) {
      // Add other platforms as needed
      default:
        throw new ValidationError(`Platform ${platform} OAuth not implemented`);
    }
  }

  async disconnectAccount(accountId: string): Promise<void> {
    return this.withErrorHandling('disconnectAccount', async () => {
      this.log('disconnectAccount', '[DIAGNOSTIC] Starting disconnect process', { accountId });

      const account = await this.getAccountById(accountId);

      // Dynamic imports to avoid circular dependencies
      const { ContentModel } = await import('../models/Content/Content');
      const Metrics = (await import('../models/Metrics')).default;

      // 1. ISOLATE associated Content: Tag with accountId and clear workspaceId
      // This prevents old content from bleeding into the next account connected to this workspace.
      // The content is preserved for history but scoped to the account, not the workspace.
      const instagramAccountId = (account as any).accountId || accountId;
      await ContentModel.updateMany(
        { workspaceId: (account as any).workspaceId, platform: 'instagram' },
        { 
          $set: { accountId: instagramAccountId },
          $unset: { workspaceId: '' }
        }
      );
      this.log('disconnectAccount', 'Isolated associated content (removed workspaceId, preserved accountId)');

      // 2. PRESERVE associated Metrics (history) - Do not delete
      // const metricsDeletion = await Metrics.deleteMany({ ... });
      this.log('disconnectAccount', 'Preserved associated metrics (Persist History)');

      // 3. PRESERVE aggregated Analytics (dashboard data) - Do not delete
      // const analyticsDeletion = await AnalyticsModel.deleteMany({ ... });
      this.log('disconnectAccount', 'Preserved associated analytics (Persist History)');

      // 4. Hard delete the SocialAccount (Connection only)
      await socialAccountRepository.deleteById(accountId);

      this.log('disconnectAccount', 'Account connection deleted (History preserved)', {
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

  async syncAccount(accountId: string, options?: { metricsType?: 'followers' | 'likes' | 'comments' | 'reach' | 'views' | 'stories' | 'profile_views' | 'all', forceRefresh?: boolean }): Promise<ISocialAccount> {
    return this.withErrorHandling('syncAccount', async () => {
      const metricsType = options?.metricsType || 'all';
      console.log(`[SYNC] syncAccount called for ${accountId} with type: ${metricsType}`);
      const account = await this.getAccountById(accountId);

      if (account.platform !== 'instagram') {
        throw new ValidationError(`Sync not supported for ${account.platform} yet`);
      }

      const accessToken = getAccessTokenFromAccount(account);
      if (!accessToken) {
        console.log(`[SYNC] ❌ Access token missing or expired for ${accountId}`);
        throw new ValidationError('Access token not found or expired');
      }

      // Determine what to fetch based on metricsType
      let fetchMedia = false;
      let fetchInsights = false;

      if (metricsType === 'all') {
        fetchMedia = true;
        fetchInsights = true;
      } else if (metricsType === 'likes' || metricsType === 'comments' || metricsType === 'views' || metricsType === 'stories' || metricsType === 'shares' || metricsType === 'saves') {
        fetchMedia = true;
      } else if (metricsType === 'reach' || metricsType === 'profile_views') {
        fetchInsights = true;
      }
      // if metricsType is 'followers', both remain false (only account profile is fetched)

      try {
        traceLog(`Starting sync for Instagram account: @${account.username}`, {
          accountId,
          tokenLen: accessToken?.length,
          tokenStart: accessToken?.substring(0, 10),
          fetchMedia,
          fetchInsights
        });

        // 1. Fetch metrics from Instagram (Granular)
        const daysLimit = options?.forceRefresh ? 90 : 14;
        const minPosts = options?.forceRefresh ? 100 : 10;
        
        const data = await InstagramApiService.getComprehensiveMetrics(
          accessToken,
          account.accountId,
          { fetchMedia, fetchInsights, forceRefresh: options?.forceRefresh, daysLimit, minPosts }
        );

        traceLog('Sync data received', {
          mediaCount: data.recentMedia?.length,
          followers: data.account?.followers_count,
          totalMediaOnProfile: data.account?.media_count
        });

        // 1.5 Save recent media as Content documents FIRST so we can query lifetime metrics accurately
        if (fetchMedia && data.recentMedia.length > 0) {
          console.log(`[SYNC] Preparing to save ${data.recentMedia.length} posts to ContentModel`);
          const { ContentModel } = await import('../models/Content/Content');
          for (const media of data.recentMedia) {
            await ContentModel.findOneAndUpdate(
              {
                workspaceId: account.workspaceId,
                'contentData.id': media.id
              },
              {
                workspaceId: account.workspaceId,
                accountId: account.accountId || accountId,
                type: media.media_type.toLowerCase() === 'carousel_album' ? 'carousel' : media.media_type.toLowerCase(),
                title: media.caption?.substring(0, 50) || 'Instagram Post',
                description: media.caption,
                contentData: {
                  ...media,
                  platform: 'instagram'
                },
                platform: 'instagram',
                status: 'published',
                isImported: true,
                publishedAt: new Date(media.timestamp),
                metrics: {
                  likes: media.like_count || 0,
                  comments: media.comments_count || 0,
                  shares: media.insights?.shares || 0,
                  saves: media.insights?.saves || 0,
                  reach: media.insights?.reach || 0,
                  views: media.insights?.video_views || 0,
                  engagement: ((media.like_count || 0) + (media.comments_count || 0)) / (data.account.followers_count || 1) * 100
                }
              },
              { upsert: true, new: true }
            );
          }
          console.log(`[SYNC] Finished saving ${data.recentMedia.length} posts to ContentModel.`);
        }

        // 2. Query the entire database to calculate true lifetime metrics (regardless of daysLimit)
        const { contentRepository } = await import('../repositories/ContentRepository');
        const dbMetrics = await contentRepository.getAggregatedMetrics(account.workspaceId.toString(), account.accountId || accountId);
        
        const oldTotalLikes = account.totalLikes || 0;
        const oldTotalComments = account.totalComments || 0;
        const oldTotalShares = account.totalShares || 0;
        const oldTotalReach = account.totalReach || 0;
        const oldTotalSaves = account.totalSaves || 0;
        const oldAvgEngagementRate = account.engagementRate || 0;
        const oldMediaCount = account.mediaCount || 0;

        const primaryReach = fetchInsights ? (data.aggregated.totalReach || 0) : oldTotalReach;
        const lifetimeReach = Math.max(dbMetrics.totalReach, primaryReach);

        // Use database sums if we fetched media, otherwise fallback to old values
        const totalLikes = fetchMedia ? dbMetrics.totalLikes : oldTotalLikes;
        const totalComments = fetchMedia ? dbMetrics.totalComments : oldTotalComments;
        const totalShares = fetchMedia ? dbMetrics.totalShares : oldTotalShares;
        const totalSaves = fetchMedia ? dbMetrics.totalSaves : oldTotalSaves;
        
        const totalPostsDb = dbMetrics.totalVideos + dbMetrics.totalImages + dbMetrics.totalCarousels;
        const postCount = fetchMedia ? Math.max(totalPostsDb, data.account.media_count || 1) : (account.mediaCount || 1);

        let engagementRate = oldAvgEngagementRate;
        if (fetchMedia && postCount > 0 && data.account.followers_count > 0) {
          const totalEngagements = totalLikes + totalComments + totalShares + totalSaves;
          const denominator = data.account.followers_count * postCount;
          engagementRate = denominator > 0 ? (totalEngagements / denominator) * 100 : 0;
        }

        const deltaLikes = Math.max(0, totalLikes - oldTotalLikes);
        const deltaComments = Math.max(0, totalComments - oldTotalComments);
        const deltaShares = Math.max(0, totalShares - oldTotalShares);

        const updatedAccount = await socialAccountRepository.updateMetrics(accountId, {
          followersCount: data.account.followers_count,
          followingCount: data.account.follows_count,
          mediaCount: data.account.media_count,
          totalLikes,
          totalComments,
          totalReach: lifetimeReach,
          totalViews: fetchInsights ? (data.insights.impressions_days_28 || data.insights.impressions || account.totalViews || 0) : account.totalViews,
          totalSaves,
          totalShares,
          engagementRate,
          avgLikes: totalLikes / (postCount || 1),
          avgComments: totalComments / (postCount || 1),
          avgReach: lifetimeReach / (postCount || 1),
          audienceCity: fetchInsights ? data.demographics?.audienceCity : account.audienceCity,
          audienceCountry: fetchInsights ? data.demographics?.audienceCountry : account.audienceCountry,
          audienceGenderAge: fetchInsights ? data.demographics?.audienceGenderAge : account.audienceGenderAge,
        });
        traceLog('Repository update successful');

        // 3. Update Analytics model for the workspace (Real-time dashboard)
        traceLog('Analytics update starting');
        const { analyticsService } = await import('./AnalyticsService');

        await analyticsService.recordMetrics({
          workspaceId: account.workspaceId.toString(),
          accountId: account.accountId || account._id.toString(),
          platform: 'instagram',
          followers: data.account.followers_count, // snapshot
          posts: data.account.media_count || 0,   // snapshot (lifetime posts)
          likes: deltaLikes,                      // growth delta
          comments: deltaComments,                // growth delta
          shares: deltaShares,                    // growth delta
          views: fetchInsights ? data.insights.impressions : 0, // daily views
          reach: fetchInsights ? primaryReach : undefined,
          reachDay: fetchInsights ? data.insights.reach_day : undefined,
          reachWeek: fetchInsights ? data.insights.reach_week : undefined,
          reachDays28: fetchInsights ? data.insights.reach_days_28 : undefined,
          engagement: engagementRate, // Authentic snapshot (e.g. 18%)
          customMetrics: {
            posts: fetchMedia ? data.aggregated.totalPosts : undefined,
            views: fetchInsights ? data.insights.impressions : undefined,
            viewsDay: fetchInsights ? data.insights.impressions_day : undefined,
            viewsWeek: fetchInsights ? data.insights.impressions_week : undefined,
            viewsDays28: fetchInsights ? data.insights.impressions_days_28 : undefined,
            profileViews: fetchInsights ? data.insights.profile_views : undefined
          },
          audienceCity: fetchInsights ? data.insights.audience_city : undefined,
          audienceCountry: fetchInsights ? data.insights.audience_country : undefined,
          audienceGenderAge: fetchInsights ? data.insights.audience_gender_age : undefined
        });
        traceLog('Analytics update successful');

        // 3b. Record follower snapshot for growth tracking
        try {
          const { InstagramFollowerSnapshotModel } = await import('../models/Analytics');
          const snapshotDate = new Date();
          snapshotDate.setUTCHours(0, 0, 0, 0);
          
          await InstagramFollowerSnapshotModel.findOneAndUpdate(
            {
              accountId: account._id,
              instagramUserId: account.accountId || accountId,
              snapshotDate
            },
            { followerCount: data.account.followers_count },
            { upsert: true, new: true }
          );
          traceLog(`Follower snapshot recorded: ${data.account.followers_count} followers`);
        } catch (snapErr: any) {
          console.error(`[SYNC] Failed to record follower snapshot:`, snapErr.message);
        }

        // 4. Save historical snapshot in Metrics collection
        traceLog('Historical metrics storage starting');
        const Metrics = (await import('../models/Metrics')).default;
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

        await Metrics.findOneAndUpdate(
          {
            workspaceId: account.workspaceId.toString(),
            instagramAccountId: account.accountId,
            metricsType: 'account',
            period: 'day',
            startDate: startOfDay
          },
          {
            $set: {
              instagramUsername: account.username,
              followers: data.account.followers_count,
              following: data.account.follows_count,
              mediaCount: data.account.media_count,
              likes: totalLikes,
              comments: totalComments,
              shares: totalShares,
              saves: totalSaves,
              reach: lifetimeReach,
              totalViews: fetchInsights ? (data.insights.impressions_days_28 || data.insights.impressions || account.totalViews || 0) : account.totalViews,
              impressions: fetchInsights ? (data.aggregated.totalImpressions || data.insights.impressions || data.insights.profile_views || 0) : account.totalViews, // graceful fallback
              engagementRate: engagementRate,
              endDate: endOfDay,
              source: 'api',
              dataStatus: fetchMedia || fetchInsights ? 'fresh' : 'partial'
            }
          },
          { upsert: true, new: true }
        );

        if (fetchMedia) {
          console.log(`[SYNC] Sync completed: @${account.username}. Synced ${data.recentMedia.length} posts.`);
          
          this.log('syncAccount', 'Account synced successfully', {
            accountId,
            platform: account.platform,
            mediaSynced: data.recentMedia.length
          });

          // Trigger AI Best Active Time calculation in background after sync
          const logFile = path.join(process.cwd(), 'debug-trace.log');
          fs.appendFileSync(logFile, `[${new Date().toISOString()}] [DEBUG] Triggering AI calculation for @${account.username}\n`);

          BestActiveTimeService.calculateBestActiveTime(accountId, accessToken)
            .then(() => {
              fs.appendFileSync(logFile, `[${new Date().toISOString()}] [DEBUG] ✅ AI calculation triggered for @${account.username}\n`);
            })
            .catch(err => {
              fs.appendFileSync(logFile, `[${new Date().toISOString()}] [DEBUG] ❌ AI calculation failed for @${account.username}: ${err.message}\n`);
            });
        }

        return updatedAccount!;
      } catch (error: any) {
        // Handle token expiration specifically (Code 190)
        if (error.code === 190 || (error.response?.data?.error?.code === 190)) {
          console.warn(`[SYNC] Token expired for @${account.username}. Marking as expired.`);
          await socialAccountRepository.setTokenStatus(accountId, 'expired');
          throw new ValidationError('Authentication expired. Please re-connect your Instagram account.');
        }
        throw error;
      }
    });
  }
}

export const socialAccountService = new SocialAccountService();
