import { BaseService } from './BaseService';
import { socialAccountRepository, Platform } from '../repositories';
import { ISocialAccount } from '../models/Social';
import { NotFoundError, ValidationError, ConflictError } from '../errors';
import { InstagramService } from '../features/instagram/services/instagram.service';
import { InstagramApiService, InstagramMediaItem } from './instagramApi';
import { getAccessTokenFromAccount } from '../storage/converters';
import * as fs from 'fs';
import * as path from 'path';
import { checkInstagramAccountExists, validateInstagramConnection } from '../utils/instagram-validation';
import { MongoStorage } from '../mongodb-storage';
import { InstagramOAuthService } from '../instagram-oauth';
import { MetricsQueueManager } from '../queues/metricsQueue';
import { getUsageStoreInstance, UsageTier, CeilingClassification } from './UsageStore';
import { TieredJobScheduler } from './TieredJobScheduler';
import { rateLimitConfig, type RateLimitConfig } from '../config/rateLimitConfig';

// Create singleton instance of InstagramService
const instagramService = new InstagramService();

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

/**
 * Filters media items for batch insights fetching based on PER-POST age buckets
 * (smart-polling-system Req 4.1–4.6).
 *
 * During backfill: returns all items (fetch insights for everything once).
 *
 * During incremental: each post is "due" when the time since its last insights
 * fetch is greater than or equal to the age-bucket interval for that post's own
 * age (scaled by the account's ceiling classification). So a fresh post (0–48h)
 * is due ~hourly, a 7–30d post ~daily, a 30d+ post ~weekly. A post that has
 * never had insights fetched (no `lastInsightsFetchedAt`) is always due. This
 * replaces the previous flat 72h freshness window, which never refreshed posts
 * older than 3 days at all.
 *
 * @param mediaItems       Media from the latest media-list fetch.
 * @param isBackfill       True during initial backfill (fetch everything).
 * @param ceiling          The account's ceiling classification (HIGH | LOW).
 * @param config           Rate-limit config supplying the age buckets + factors.
 * @param lastFetchedByMediaId Map of mediaId → last insights fetch time (ms).
 *                         Posts absent from the map are treated as never-fetched.
 * @param now              Current time (ms), injectable for testing.
 */
export function filterMediaForInsights(
  mediaItems: InstagramMediaItem[],
  isBackfill: boolean,
  ceiling?: CeilingClassification,
  config?: RateLimitConfig,
  lastFetchedByMediaId?: Map<string, number | null>,
  now: number = Date.now()
): InstagramMediaItem[] {
  if (isBackfill) return mediaItems;

  // Backward-compatible fallback: when the age-bucket inputs aren't supplied,
  // keep the legacy 72h freshness window so callers that haven't been updated
  // still behave as before.
  if (!ceiling || !config || !lastFetchedByMediaId) {
    const LEGACY_FRESHNESS_WINDOW_MS = 72 * 60 * 60 * 1000;
    return mediaItems.filter(media => {
      const publishedAt = new Date(media.timestamp).getTime();
      return now - publishedAt < LEGACY_FRESHNESS_WINDOW_MS;
    });
  }

  return mediaItems.filter(media => {
    const publishedAt = new Date(media.timestamp).getTime();
    if (!Number.isFinite(publishedAt)) return false;

    const postAgeMs = now - publishedAt;
    // Hard cutoff: never fetch insights for posts older than the configured max
    // age (default 6 months). Old posts rarely change and aren't worth the API cost.
    if (postAgeMs > config.smartPolling.maxInsightsAgeMs) return false;
    // The refresh interval for THIS post based on its own age bucket + ceiling.
    const intervalMs = TieredJobScheduler.computePostInterval(postAgeMs, ceiling, config);

    const lastFetched = lastFetchedByMediaId.get(media.id);
    // Never fetched → always due.
    if (lastFetched === undefined || lastFetched === null || !Number.isFinite(lastFetched)) {
      return true;
    }
    // Due when a full bucket interval has elapsed since the last fetch.
    return now - lastFetched >= intervalMs;
  });
}

/**
 * A stored (already-persisted) post reduced to just the fields needed to decide
 * whether its insights are due for an age-bucket refresh.
 */
export interface StoredPostForInsights {
  mediaId: string;
  mediaType: string;
  /** ISO timestamp string from the original media item. */
  timestamp: string;
  /** Publish time in ms. */
  publishedAt: number;
  /** Last insights fetch time in ms, or null if never fetched. */
  lastInsightsFetchedAt: number | null;
}

/**
 * Selects which ALREADY-STORED posts are due for an age-bucket insights refresh
 * (smart-polling-system Req 4.1–4.6).
 *
 * The incremental media-list fetch only returns the newest N posts, so older
 * posts that live only in the DB were never revisited by age bucket. This
 * function operates directly on stored posts so the incremental cycle can pick
 * up due posts of ANY age (a 2-month or 6-month post becomes due ~weekly) and
 * batch-fetch their insights by media id.
 *
 * A post is due when the time since its last insights fetch is greater than or
 * equal to the age-bucket interval for that post's own age (scaled by ceiling).
 * A post that has never had insights fetched is always due.
 *
 * @param posts   Stored posts reduced to {@link StoredPostForInsights}.
 * @param ceiling The account's ceiling classification (HIGH | LOW).
 * @param config  Rate-limit config supplying the age buckets + scaling factors.
 * @param now     Current time (ms), injectable for testing.
 */
export function selectDueStoredPosts(
  posts: StoredPostForInsights[],
  ceiling: CeilingClassification,
  config: RateLimitConfig,
  now: number = Date.now()
): StoredPostForInsights[] {
  return posts.filter(post => {
    if (!Number.isFinite(post.publishedAt)) return false;
    const postAgeMs = now - post.publishedAt;
    // Hard cutoff: never fetch insights for posts older than the configured max
    // age (default 6 months), regardless of bucket cadence.
    if (postAgeMs > config.smartPolling.maxInsightsAgeMs) return false;
    const intervalMs = TieredJobScheduler.computePostInterval(postAgeMs, ceiling, config);

    const lastFetched = post.lastInsightsFetchedAt;
    if (lastFetched === null || lastFetched === undefined || !Number.isFinite(lastFetched)) {
      return true;
    }
    return now - lastFetched >= intervalMs;
  });
}

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
      const active = accounts.filter(a => a.isActive);

      // Enrich followersCount from the latest InstagramFollowerSnapshot so the
      // social account card always shows the same number as the analytics dashboards.
      // Both read from the same snapshot table — this prevents the 454 vs 455
      // discrepancy that occurs when a snapshot is written before SocialAccount
      // fields are refreshed by the next polling cycle.
      try {
        const { InstagramFollowerSnapshotModel } = await import('../models/Analytics');
        for (const account of active) {
          if (account.platform !== 'instagram' || !account.accountId) continue;
          const snap = await InstagramFollowerSnapshotModel.findOne({
            instagramUserId: account.accountId,
            followerCount: { $gt: 0 },
          })
            .sort({ snapshotDate: -1 })
            .lean() as { followerCount?: number } | null;
          if (snap && typeof snap.followerCount === 'number' && snap.followerCount > 0) {
            // Cast to any to allow patching the in-memory object before it's serialized
            (account as any).followersCount = snap.followerCount;
          }
        }
      } catch { /* non-fatal — falls back to SocialAccount.followersCount */ }

      return active;
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

      // For newly connected accounts, assume minimum ceiling (10 impressions → LOW)
      // until real insights data is fetched during the first sync.
      if (input.platform === 'instagram' || input.platform === 'instagram_advanced') {
        try {
          const usageStore = getUsageStoreInstance();
          const instAccountId = input.accountId || account.accountId;
          if (instAccountId) {
            await usageStore.updateImpressionsEstimate(instAccountId, 10);
            console.log(`[CONNECT] Initialized impressions estimate for @${input.username}: 10 (minimum ceiling → LOW)`);
          }
        } catch (impressionsError: any) {
          console.warn(`[CONNECT] ⚠️ Failed to set initial impressions estimate for @${input.username}:`, impressionsError?.message || impressionsError);
        }
      }

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

          const accountId = (account._id as any).toString();

          // Notify client immediately that sync is starting
          try {
            const RealtimeService = require('./realtime').default;
            RealtimeService.broadcastToWorkspace(input.workspaceId.toString(), 'instagram_sync_started', {
              type: 'initial_sync',
              accountId: accountId,
              username: input.username
            });
          } catch (e) { /* RealtimeService may not be initialized */ }

          // Hand connect/reconnect initialization to the BullMQ worker (Redis-backed):
          //   restore-from-DB (no changes) | incremental sync | full backfill.
          // Falls back to running inline only if the queue/Redis is unavailable.
          (async () => {
            try {
              const connectInitPayload = {
                workspaceId: input.workspaceId.toString(),
                instagramAccountId: String(instAccountId),
                token: tokenToUse,
                username: input.username,
                mediaCount: input.profileData?.mediaCount,
                followersCount: input.profileData?.followersCount,
              };

              const enqueued = await MetricsQueueManager.enqueueConnectInit(connectInitPayload);
              if (enqueued) {
                console.log('[CONNECT] 📥 connect-init queued to BullMQ worker');
              } else {
                console.log('[CONNECT] ⚠️ Queue unavailable, running connect-init inline (fallback)');
                const { ConnectInitService } = await import('./ConnectInitService');
                await ConnectInitService.run({
                  workspaceId: input.workspaceId.toString(),
                  instagramAccountId: String(instAccountId),
                  accessToken: tokenToUse,
                  username: input.username,
                  mediaCount: input.profileData?.mediaCount,
                  followersCount: input.profileData?.followersCount,
                });
              }
            } catch (err: any) {
              console.warn(`[CONNECT] ⚠️ Failed to dispatch connect-init for @${input.username}:`, err?.message || err);
              try {
                const RealtimeService = require('./realtime').default;
                RealtimeService.broadcastToWorkspace(input.workspaceId.toString(), 'instagram_sync_failed', {
                  accountId: accountId,
                  username: input.username
                });
              } catch (e) { /* ok */ }
            }
          })();
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
      // We also stamp `disconnectedAt` so a reconnect within 30 days can restore data from
      // the database WITHOUT re-fetching everything from the Meta API.
      const instagramAccountId = (account as any).accountId || accountId;
      await ContentModel.updateMany(
        { workspaceId: (account as any).workspaceId, platform: 'instagram' },
        { 
          $set: { accountId: instagramAccountId, disconnectedAt: new Date() },
          $unset: { workspaceId: '' }
        }
      );
      this.log('disconnectAccount', 'Isolated associated content (removed workspaceId, preserved accountId, stamped disconnectedAt for 30-day restore window)');

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

  async syncAccount(accountId: string, options?: { metricsType?: 'followers' | 'likes' | 'comments' | 'reach' | 'views' | 'stories' | 'profile_views' | 'new_posts' | 'all', forceRefresh?: boolean }): Promise<ISocialAccount> {
    return this.withErrorHandling('syncAccount', async () => {
      const metricsType = options?.metricsType || 'all';
      console.log(`[SYNC] syncAccount called for ${accountId} with type: ${metricsType}`);
      const account = await this.getAccountById(accountId);

      // Facebook Page sync — fetches profile + analytics from Facebook Graph API
      if (account.platform === 'facebook') {
        return this.syncFacebookAccount(account);
      }
      // Other non-instagram platforms not yet supported
      if (account.platform !== 'instagram' && account.platform !== 'instagram_advanced') {
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
      // Detection-only mode: fetch the media list to discover new posts but do
      // NOT fetch per-post insights or refresh older stored posts. Per-post
      // insights are the job of the `postInsightsRecent` cadence; newly found
      // posts (never-fetched) are picked up there on the next run.
      let detectionOnly = false;

      if (metricsType === 'all') {
        fetchMedia = true;
        fetchInsights = true;
      } else if (metricsType === 'new_posts') {
        fetchMedia = true;
        detectionOnly = true;
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
        
        // Phase detection: determine backfill vs incremental sync
        const { ContentModel: ContentModelForPhase } = await import('../models/Content/Content');
        const existingPostsCount = await ContentModelForPhase.countDocuments({
          workspaceId: account.workspaceId,
          accountId: account.accountId || accountId,
          isImported: true
        });

        const isBackfill = existingPostsCount === 0 || !!options?.forceRefresh;
        // Cap initial backfill at 100 media items to limit Meta API usage (was 200).
        const mediaLimit = isBackfill ? 100 : 10;

        console.log(`[SYNC] Phase detection: existingPosts=${existingPostsCount}, isBackfill=${isBackfill}, mediaLimit=${mediaLimit}`);

        // Usage tier check: determine if we should skip insights to conserve API budget
        // The new rate-limit architecture uses UsageStore (BUC-aware) instead of the old
        // flat-rate ApiBudgetTracker (200 calls/hour).
        let skipInsights = false;
        try {
          const usageStore = getUsageStoreInstance();
          const { tier, percentage } = await usageStore.getEffectiveUsage(account.accountId || accountId);
          if (tier === UsageTier.RESTRICTED || tier === UsageTier.CRITICAL) {
            skipInsights = true;
            fetchInsights = false;
            console.log(`[SYNC] ⚠️ Usage tier ${tier} (${percentage}%), skipping insights for @${account.username}`);
          }
          console.log(`[SYNC] Usage check: tier=${tier}, percentage=${percentage}%, skipInsights=${skipInsights}`);
        } catch (usageError: any) {
          console.warn(`[SYNC] ⚠️ Failed to check usage tier, proceeding with full sync:`, usageError?.message || usageError);
        }

        // Track actual API call count during sync
        let apiCallCount = 0;
        
        // Fetch data using new InstagramService.
        // Profile is required; insights and media are best-effort so a single
        // failing call (or a partially-degraded token) doesn't sink the sync.
        const [profileResult, insightsResult, mediaResult] = await Promise.allSettled([
          instagramService.getUserProfile(accessToken, account.accountId),
          fetchInsights ? instagramService.getAccountInsights(accessToken, account.accountId) : Promise.resolve({} as any),
          fetchMedia ? InstagramApiService.getUserMedia(accessToken, mediaLimit, account.accountId).then(res => res.data) : Promise.resolve([])
        ]);

        // Profile is mandatory: without it there is nothing meaningful to persist.
        if (profileResult.status === 'rejected') {
          throw profileResult.reason;
        }
        const accountProfile = profileResult.value;
        apiCallCount++; // Profile call always counts

        if (insightsResult.status === 'rejected') {
          console.warn(`[SYNC] ⚠️ Insights fetch failed for @${account.username}, continuing without insights:`, insightsResult.reason?.message || insightsResult.reason);
        }
        const accountInsights = insightsResult.status === 'fulfilled' ? insightsResult.value : ({} as any);
        if (fetchInsights) {
          apiCallCount++; // Account insights call
        }

        // Track impressions for rate-limit ceiling classification
        // This updates the rolling impressions estimate in UsageStore which drives
        // the HIGH/LOW ceiling classification and polling cadence decisions.
        if (fetchInsights && insightsResult.status === 'fulfilled') {
          try {
            const usageStore = getUsageStoreInstance();
            const dailyImpressions = accountInsights?.impressions || 0;
            await usageStore.updateImpressionsEstimate(
              account.accountId || accountId,
              dailyImpressions
            );
            console.log(`[SYNC] Impressions estimate updated for @${account.username}: ${dailyImpressions}`);
          } catch (impressionsError: any) {
            console.warn(`[SYNC] ⚠️ Failed to update impressions estimate for @${account.username}:`, impressionsError?.message || impressionsError);
          }
        }

        if (mediaResult.status === 'rejected') {
          console.warn(`[SYNC] ⚠️ Media fetch failed for @${account.username}, continuing without media:`, mediaResult.reason?.message || mediaResult.reason);
        }
        const mediaList = mediaResult.status === 'fulfilled' ? mediaResult.value : [];
        if (fetchMedia) {
          apiCallCount++; // Media list call
        }

        // Batch insights: fetch per-post reach/saves/shares via single batch API call
        let batchInsights: Record<string, { reach?: number; saves?: number; shares?: number; impressions?: number; engagement?: number }> = {};
        if (!skipInsights && !detectionOnly && fetchMedia && mediaList.length > 0) {
          try {
            // Per-post age-bucket due selection (smart-polling-system Req 4.1–4.6):
            // resolve the account's ceiling classification and each post's last
            // insights-fetch time so a post is only re-fetched once its own age
            // bucket interval has elapsed (fresh posts ~hourly … 30d+ posts ~weekly).
            let ceiling: CeilingClassification = CeilingClassification.LOW;
            try {
              ceiling = await getUsageStoreInstance().getCeilingClassification(account.accountId || accountId);
            } catch { /* default LOW */ }

            const lastFetchedByMediaId = new Map<string, number | null>();
            try {
              const { ContentModel } = await import('../models/Content/Content');
              const mediaIds = mediaList.map(m => m.id);
              const existing = await ContentModel.find({
                workspaceId: account.workspaceId,
                'contentData.id': { $in: mediaIds },
              })
                .select('contentData.id lastInsightsFetchedAt')
                .lean();
              for (const doc of existing as any[]) {
                const id = doc?.contentData?.id;
                if (id) {
                  lastFetchedByMediaId.set(
                    id,
                    doc.lastInsightsFetchedAt ? new Date(doc.lastInsightsFetchedAt).getTime() : null
                  );
                }
              }
            } catch (lookupErr: any) {
              console.warn(`[SYNC] ⚠️ Failed to load last-insights timestamps, treating all as due:`, lookupErr?.message || lookupErr);
            }

            const mediaForInsights = filterMediaForInsights(
              mediaList,
              isBackfill,
              ceiling,
              rateLimitConfig,
              lastFetchedByMediaId
            );
            if (mediaForInsights.length > 0) {
              console.log(`[SYNC] Fetching batch insights for ${mediaForInsights.length}/${mediaList.length} media items (isBackfill=${isBackfill}, ceiling=${ceiling}) — age-bucket due`);
              batchInsights = await InstagramApiService.getBatchMediaInsights(mediaForInsights, accessToken);
              apiCallCount++; // Batch insights call
              console.log(`[SYNC] Batch insights received for ${Object.keys(batchInsights).length} items`);
            } else {
              console.log(`[SYNC] No media items due for insights this cycle (age-bucket), skipping batch insights`);
            }
          } catch (batchError: any) {
            console.warn(`[SYNC] ⚠️ Batch insights fetch failed for @${account.username}, continuing with likes/comments only:`, batchError?.message || batchError);
          }
        } else if (skipInsights) {
          console.log(`[SYNC] Skipping batch insights due to high usage tier`);
        } else if (detectionOnly) {
          console.log(`[SYNC] Detection-only sync (new_posts): media list fetched, skipping per-post insights`);
        }

        // DB-driven age-bucket refresh for OLDER stored posts (smart-polling-system Req 4.1–4.6).
        // The incremental media-list fetch only returns the newest `mediaLimit` posts, so posts
        // older than that slice (which live only in the DB) were never revisited by age bucket —
        // a 2-month or 6-month post got insights once at backfill and never again. Here we query
        // ALL stored posts for this account, select those whose OWN age-bucket interval has
        // elapsed since their last insights fetch, batch-fetch their insights by media id, and
        // persist directly. Skipped during backfill (the main path already fetches everything)
        // and when usage tier is high.
        if (!skipInsights && !detectionOnly && fetchMedia && !isBackfill) {
          try {
            const { ContentModel } = await import('../models/Content/Content');

            let olderCeiling: CeilingClassification = CeilingClassification.LOW;
            try {
              olderCeiling = await getUsageStoreInstance().getCeilingClassification(account.accountId || accountId);
            } catch { /* default LOW */ }

            // Ids already handled by the latest-media batch above — don't refetch them.
            const freshIds = new Set(mediaList.map(m => m.id));

            const storedDocs = await ContentModel.find({
              workspaceId: account.workspaceId,
              accountId: account.accountId || accountId,
              platform: 'instagram',
              isImported: true,
            })
              .select('contentData.id contentData.media_type type publishedAt lastInsightsFetchedAt')
              .lean();

            const storedPosts: StoredPostForInsights[] = [];
            for (const doc of storedDocs as any[]) {
              const mediaId = doc?.contentData?.id;
              if (!mediaId || freshIds.has(mediaId)) continue;
              const publishedAtMs = doc.publishedAt ? new Date(doc.publishedAt).getTime() : NaN;
              const mediaType = (doc?.contentData?.media_type || doc?.type || 'IMAGE').toString().toUpperCase();
              storedPosts.push({
                mediaId,
                mediaType,
                timestamp: doc.publishedAt ? new Date(doc.publishedAt).toISOString() : new Date(0).toISOString(),
                publishedAt: publishedAtMs,
                lastInsightsFetchedAt: doc.lastInsightsFetchedAt ? new Date(doc.lastInsightsFetchedAt).getTime() : null,
              });
            }

            const dueStored = selectDueStoredPosts(storedPosts, olderCeiling, rateLimitConfig);
            // Cap per-cycle to bound Meta API usage on large back-catalogs; remaining
            // due posts are picked up on subsequent cycles.
            const MAX_STORED_REFRESH = 50;
            const dueBatch = dueStored.slice(0, MAX_STORED_REFRESH);

            if (dueBatch.length > 0) {
              console.log(`[SYNC] DB age-bucket refresh: ${dueBatch.length}/${storedPosts.length} older stored post(s) due (ceiling=${olderCeiling})`);
              const VALID_TYPES = ['IMAGE', 'VIDEO', 'CAROUSEL_ALBUM', 'STORY'];
              const mediaItemsForOlder: InstagramMediaItem[] = dueBatch.map(p => ({
                id: p.mediaId,
                media_type: (VALID_TYPES.includes(p.mediaType) ? p.mediaType : 'IMAGE') as InstagramMediaItem['media_type'],
                timestamp: p.timestamp,
              }));

              const olderInsights = await InstagramApiService.getBatchMediaInsights(mediaItemsForOlder, accessToken);
              apiCallCount++; // Older-posts batch insights call

              const refreshNow = new Date();
              let persisted = 0;
              for (const item of mediaItemsForOlder) {
                const ins = olderInsights[item.id];
                if (!ins || Object.keys(ins).length === 0) continue;
                await ContentModel.findOneAndUpdate(
                  { workspaceId: account.workspaceId, 'contentData.id': item.id },
                  {
                    $set: {
                      'metrics.shares': ins.shares || 0,
                      'metrics.saves': ins.saves || 0,
                      'metrics.reach': ins.reach || 0,
                      'metrics.impressions': ins.impressions || 0,
                      lastInsightsFetchedAt: refreshNow,
                    },
                  }
                );
                persisted++;
              }
              console.log(`[SYNC] DB age-bucket refresh: persisted insights for ${persisted} older post(s)`);
            } else {
              console.log(`[SYNC] DB age-bucket refresh: no older stored posts due this cycle`);
            }
          } catch (olderErr: any) {
            console.warn(`[SYNC] ⚠️ DB age-bucket refresh for older posts failed:`, olderErr?.message || olderErr);
          }
        }

        // Usage is now tracked automatically by GovernedHttpClient via response headers.
        // No manual call recording needed (the old ApiBudgetTracker.recordCalls is removed).
        console.log(`[SYNC] API calls made: ${apiCallCount} for @${account.username}`);

        // Build compatible data structure for existing code
        const data = {
          account: {
            id: accountProfile.id,
            username: accountProfile.username,
            name: accountProfile.name,
            biography: accountProfile.biography,
            website: accountProfile.website,
            account_type: accountProfile.account_type,
            media_count: accountProfile.media_count,
            followers_count: accountProfile.followers_count,
            follows_count: accountProfile.follows_count,
            profile_picture_url: accountProfile.profile_picture_url
          },
          insights: accountInsights || {},
          recentMedia: mediaList.map(media => {
            const mediaInsights = batchInsights[media.id] || {};
            return {
              id: media.id,
              media_type: media.media_type,
              media_url: media.media_url,
              permalink: media.permalink,
              thumbnail_url: media.thumbnail_url,
              timestamp: media.timestamp,
              caption: media.caption,
              like_count: media.like_count,
              comments_count: media.comments_count,
              insights: {
                impressions: mediaInsights.impressions || 0,
                reach: mediaInsights.reach || 0,
                shares: mediaInsights.shares || 0,
                saves: mediaInsights.saves || 0,
                // views = per-post play count (Meta's v18+ replacement for video_views on reels/videos)
                views: mediaInsights.views || mediaInsights.video_views || 0,
                video_views: mediaInsights.video_views || mediaInsights.views || 0,
              }
            };
          }),
          aggregated: {
            totalLikes: mediaList.reduce((sum, m) => sum + (m.like_count || 0), 0),
            totalComments: mediaList.reduce((sum, m) => sum + (m.comments_count || 0), 0),
            totalShares: Object.values(batchInsights).reduce((sum, ins) => sum + (ins.shares || 0), 0),
            totalSaves: Object.values(batchInsights).reduce((sum, ins) => sum + (ins.saves || 0), 0),
            totalReach: Object.values(batchInsights).reduce((sum, ins) => sum + (ins.reach || 0), 0),
            totalImpressions: Object.values(batchInsights).reduce((sum, ins) => sum + (ins.impressions || 0), 0),
            totalPosts: mediaList.length,
            averageEngagementRate: 0
          },
          demographics: {
            audienceCity: accountInsights?.audience_city,
            audienceCountry: accountInsights?.audience_country,
            audienceGenderAge: accountInsights?.audience_gender_age,
            audienceActiveTime: accountInsights?.audience_active_time,
            audienceActiveTimeWeekly: accountInsights?.audience_active_time_weekly
          }
        };

        // Engagement rate is calculated after media persistence using posts-with-metrics denominator (see below)

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
            const hasBatchInsights = batchInsights[media.id] && Object.keys(batchInsights[media.id]).length > 0;
            const updateData: any = {
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
            };

            // likes/comments come from the media list itself, so they are always
            // fresh and safe to overwrite every cycle.
            const baseMetrics: any = {
              likes: media.like_count || 0,
              comments: media.comments_count || 0,
              engagement: ((media.like_count || 0) + (media.comments_count || 0)) / (data.account.followers_count || 1) * 100,
            };

            if (hasBatchInsights) {
              // We fetched per-post insights THIS cycle → write the fresh values.
              updateData.metrics = {
                ...baseMetrics,
                shares: media.insights?.shares || 0,
                saves: media.insights?.saves || 0,
                reach: media.insights?.reach || 0,
                views: media.insights?.views || media.insights?.video_views || 0,
              };
              updateData.lastInsightsFetchedAt = new Date();
            } else {
              // This post was NOT due for insights this cycle (age-bucket), so
              // batchInsights has nothing for it. Writing reach/views/saves/shares
              // as 0 here would CLOBBER the values captured on a previous cycle.
              // Use dot-paths to update ONLY likes/comments/engagement and leave
              // the insight metrics untouched (smart-polling-system Req 4 — stale
              // insights are preserved between age-bucket refreshes).
              updateData['metrics.likes'] = baseMetrics.likes;
              updateData['metrics.comments'] = baseMetrics.comments;
              updateData['metrics.engagement'] = baseMetrics.engagement;
            }

            await ContentModel.findOneAndUpdate(
              {
                workspaceId: account.workspaceId,
                'contentData.id': media.id
              },
              updateData,
              { upsert: true, new: true }
            );
          }
          console.log(`[SYNC] Finished saving ${data.recentMedia.length} posts to ContentModel.`);

          // Deletion reconciliation: on a full sync (backfill), data.recentMedia holds
          // the current set of posts. Any imported Content doc for this account whose id
          // is NOT in that set was deleted on Instagram — remove it so the DB count
          // converges to the real profile count.
          //
          // SAFETY: only reconcile when we are confident we fetched the COMPLETE set,
          // i.e. the fetched count is at least the profile's media_count. If the account
          // has more posts than our backfill cap (mediaLimit), we only have a recent
          // slice and must NOT delete the older posts we simply didn't fetch.
          if (isBackfill) {
            const fetchedIds = data.recentMedia
              .map((m: any) => m.id)
              .filter((id: any) => typeof id === 'string');
            const profilePostCount = data.account?.media_count ?? 0;
            const haveCompleteSet =
              fetchedIds.length > 0 && fetchedIds.length >= profilePostCount;

            if (haveCompleteSet) {
              const deletion = await ContentModel.deleteMany({
                workspaceId: account.workspaceId,
                accountId: account.accountId || accountId,
                platform: 'instagram',
                isImported: true,
                'contentData.id': { $nin: fetchedIds },
              });
              if (deletion.deletedCount && deletion.deletedCount > 0) {
                console.log(`[SYNC] 🗑️ Reconciled deletions: removed ${deletion.deletedCount} post(s) no longer on Instagram.`);
              }
            } else {
              console.log(`[SYNC] Skipping deletion reconciliation (fetched ${fetchedIds.length} of ${profilePostCount} posts — not the complete set).`);
            }
          }
        }

        // 2. Query the entire database to calculate true lifetime metrics
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
        if (fetchMedia && data.account.followers_count > 0) {
          // Query ContentModel for posts with at least one non-zero metric
          const { ContentModel: ContentModelForMetrics } = await import('../models/Content/Content');
          const postsWithMetricsCount = await ContentModelForMetrics.countDocuments({
            workspaceId: account.workspaceId,
            accountId: account.accountId || accountId,
            isImported: true,
            $or: [
              { 'metrics.likes': { $gt: 0 } },
              { 'metrics.comments': { $gt: 0 } },
              { 'metrics.shares': { $gt: 0 } },
              { 'metrics.saves': { $gt: 0 } }
            ]
          });

          if (postsWithMetricsCount > 0) {
            const totalEngagements = totalLikes + totalComments + totalShares + totalSaves;
            engagementRate = (totalEngagements / (data.account.followers_count * postsWithMetricsCount)) * 100;
          } else {
            engagementRate = 0;
          }
        }

        const deltaLikes = Math.max(0, totalLikes - oldTotalLikes);
        const deltaComments = Math.max(0, totalComments - oldTotalComments);
        const deltaShares = Math.max(0, totalShares - oldTotalShares);

        // ── DATA WRITE ARCHITECTURE ─────────────────────────────────────────────
        // Each collection serves a distinct read pattern. This fan-out is intentional.
        // See docs/analytics/DATA_ARCHITECTURE.md for the full map.
        //
        //  1. SocialAccount   — live current state; home dashboard account card
        //  2. Analytics       — daily snapshot; home dashboard Performance Overview
        //  3. InstagramFollowerSnapshot — daily absolute count; analytics dashboards
        //  4. Metrics         — wide daily snapshot; legacy polling status endpoint
        //  5. AnalyticsDailyMetric — per-day KPI history (BullMQ worker, not this path)
        //  6. Content.metrics — per-post metrics (written in step 1.5 above)
        // ─────────────────────────────────────────────────────────────────────────

        // WRITE 1: SocialAccount — live current totals for account card and polling
        const updatedAccount = await socialAccountRepository.updateMetrics(accountId, {
          followersCount: data.account.followers_count,
          followingCount: data.account.follows_count,
          mediaCount: data.account.media_count,
          totalLikes,
          totalComments,
          totalReach: lifetimeReach,
          // Meta's TRUE account-level reach (deduplicated, trailing 28 days).
          // Distinct from totalReach (sum of post reaches). Only overwrite when
          // we actually fetched account insights this cycle; otherwise preserve
          // the previously stored value so a media-only sync doesn't zero it.
          accountReach: fetchInsights
            ? (data.insights.reach_days_28 ?? data.insights.reach_week ?? data.insights.reach_day ?? account.accountReach ?? 0)
            : (account.accountReach ?? 0),
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
          audienceActiveTime: fetchInsights ? data.demographics?.audienceActiveTime : account.audienceActiveTime,
          audienceActiveTimeWeekly: fetchInsights ? data.demographics?.audienceActiveTimeWeekly : (account as any).audienceActiveTimeWeekly,
          ...(fetchInsights ? { demographicsLastFetched: new Date() } : {}),
        });
        traceLog('Repository update successful');

        // Also patch username + profilePictureUrl from the live API profile so
        // that accounts initially saved with a numeric IG ID as username (e.g.
        // auto-connected via Facebook OAuth before instagram_basic scope was
        // granted) get corrected on the next successful sync cycle.
        if (data.account.username && data.account.username !== account.username) {
          try {
            await socialAccountRepository.updateById(accountId, {
              username: data.account.username,
              profilePictureUrl: data.account.profile_picture_url || account.profilePictureUrl,
              biography: data.account.biography || account.biography,
              website: data.account.website || account.website,
              updatedAt: new Date(),
            } as any);
            console.log(`[SYNC] Fixed username: ${account.username} → ${data.account.username}`);
          } catch (usernameFixErr: any) {
            console.warn(`[SYNC] ⚠️ Failed to fix username:`, usernameFixErr?.message);
          }
        }

        // WRITE 2: Analytics collection — daily snapshot for home dashboard
        // Performance Overview (/api/analytics/historical, getPerformanceSummary).
        // LegacyRollupReadStore prefers AnalyticsDailyMetric when available,
        // falling back to this collection for recent data.
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

        // WRITE 3: InstagramFollowerSnapshot — ONE row per account per day.
        // This is the authoritative source for the current and historical follower
        // count shown in both the home dashboard and analytics dashboards. Using
        // instagramUserId as the key means data survives disconnect/reconnect.
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

          // Keep SocialAccount.followersCount in sync with the snapshot so every
          // consumer reads the same number. The metrics update above (line 1065)
          // already does this from the same source, but guard against any drift
          // that could occur if this code path runs without a full metrics update.
          if (
            data.account.followers_count &&
            data.account.followers_count !== account.followersCount
          ) {
            await socialAccountRepository.updateMetrics((account._id as any).toString(), {
              followersCount: data.account.followers_count,
            });
            traceLog(`SocialAccount.followersCount synced to snapshot value: ${data.account.followers_count}`);
          }
        } catch (snapErr: any) {
          console.error(`[SYNC] Failed to record follower snapshot:`, snapErr.message);
        }

        // WRITE 4: Metrics collection — wide daily snapshot for the legacy
        // /api/workspaces/:id/metrics endpoint (polling status card).
        // NOTE: LegacyRollupReadStore analytics dashboards do NOT read this.
        // Has a 90-day TTL (auto-expires). See DATA_ARCHITECTURE.md.
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

          // NOTE: The old V4.6 "AI Best Active Time" background calculation was
          // removed here. Best-time recommendations are now computed on-demand by
          // the unified engine (server/services/bestTimeEngine.ts via
          // bestTimeService.getSmartBestTime), which reads audienceActiveTimeWeekly
          // + Content directly — no post-sync trigger or stored field needed.
        }

        // Data changed → refresh the VeeGPT workspace-context snapshot in the
        // background (BullMQ worker) so chat always reflects the latest stats.
        // Also invalidate the Redis AI banner cache so the banner regenerates with
        // fresh follower/engagement data on the user's next dashboard load.
        try {
          const wsId = (account as any).workspaceId?.toString?.() || (account as any).workspaceId;
          if (wsId) {
            // Invalidate all period variants of the AI insight banner cache
            try {
              const { getSharedRedisConnection } = await import('../lib/redis');
              const { insightsCacheKey } = await import('../queues/insightsQueue');
              const redis = getSharedRedisConnection();
              if (redis && redis.status === 'ready') {
                await Promise.allSettled([
                  redis.del(insightsCacheKey('banner', wsId, 'day')),
                  redis.del(insightsCacheKey('banner', wsId, 'week')),
                  redis.del(insightsCacheKey('banner', wsId, 'month')),
                  redis.del(insightsCacheKey('recommendations', wsId)),
                ]);
              }
              // Also clear the dashboard analytics server cache so the next
              // /api/dashboard/analytics call returns fresh follower count
              try {
                const { CachingSystem } = await import('../performance/caching-system');
                await CachingSystem.invalidateByTag('dashboard');
              } catch { /* non-fatal */ }
            } catch { /* non-fatal */ }

            const storage = await import('../mongodb-storage').then(m => m.storage);
            const ws = await storage.getWorkspace(wsId).catch(() => undefined);
            const ownerId = (ws as any)?.userId?.toString?.() || (ws as any)?.userId;
            if (ownerId) {
              const { refreshWorkspaceContext } = await import('./WorkspaceContextAccessor');
              void refreshWorkspaceContext(wsId, ownerId, 'account-sync');
            }
          }
        } catch (ctxErr: any) {
          console.warn('[SYNC] VeeGPT context refresh trigger failed (non-critical):', ctxErr?.message);
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

  /**
   * Sync a Facebook Page account — fetches profile, analytics, and posts.
   * Writes to SocialAccount, Analytics, and Content collections.
   * Does NOT touch Instagram code paths.
   */
  private async syncFacebookAccount(account: ISocialAccount): Promise<ISocialAccount> {
    const { FacebookProvider } = await import('../features/facebook/providers/FacebookProvider');
    const { analyticsService } = await import('./AnalyticsService');
    const { socialAccountRepository: repo } = await import('../repositories/SocialAccountRepository');

    const facebookProvider = new FacebookProvider();
    const accessToken = getAccessTokenFromAccount(account);
    if (!accessToken) {
      throw new ValidationError('Facebook access token not found or expired');
    }

    const accountId = account.accountId!;
    console.log(`[FB SYNC] Starting sync for Facebook Page ${accountId} (@${account.username})`);

    // Fetch profile, analytics (28-day), 1-day, 7-day, and posts in parallel
    const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const twentyEightDaysAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);
    const now = new Date();

    const [profileResult, analyticsResult, analytics1dResult, analytics7dResult, postsResult] = await Promise.allSettled([
      facebookProvider.getProfile(accessToken, accountId),
      facebookProvider.getAnalytics({
        accessToken,
        accountId,
        from: twentyEightDaysAgo,
        to: now,
      }),
      facebookProvider.getAnalytics({
        accessToken,
        accountId,
        from: oneDayAgo,
        to: now,
      }),
      facebookProvider.getAnalytics({
        accessToken,
        accountId,
        from: sevenDaysAgo,
        to: now,
      }),
      facebookProvider.getPagePosts(accessToken, accountId, 25),
    ]);

    if (profileResult.status === 'rejected') {
      console.warn(`[FB SYNC] Profile fetch failed for ${accountId}:`, (profileResult.reason as Error).message);
    }
    if (analyticsResult.status === 'rejected') {
      console.warn(`[FB SYNC] Analytics fetch failed for ${accountId}:`, (analyticsResult.reason as Error).message);
    }
    if (postsResult.status === 'rejected') {
      console.warn(`[FB SYNC] Posts fetch failed for ${accountId}:`, (postsResult.reason as Error).message);
    }

    const profile = profileResult.status === 'fulfilled' ? profileResult.value : null;
    const analytics = analyticsResult.status === 'fulfilled' ? analyticsResult.value : null;
    const analytics1d = analytics1dResult.status === 'fulfilled' ? analytics1dResult.value : null;
    const analytics7d = analytics7dResult.status === 'fulfilled' ? analytics7dResult.value : null;
    const fbPosts = postsResult.status === 'fulfilled' ? postsResult.value : [];

    // 1. Update SocialAccount with latest profile data
    const followersCount = profile?.followersCount ?? (account.followersCount || 0);
    const profilePictureUrl = profile?.profilePictureUrl || account.profilePictureUrl;
    const displayName = profile?.displayName || (account as any).pageName || account.username;
    const accountDbId = (account._id as any).toString();

    await repo.updateById(accountDbId, {
      followersCount,
      profilePictureUrl,
      pageName: displayName,
      lastSyncAt: new Date(),
      updatedAt: new Date(),
    } as any);

    console.log(`[FB SYNC] Updated profile for ${accountId}: followers=${followersCount}, posts=${fbPosts.length}`);

    // 2. Store Facebook posts in the Content collection
    if (fbPosts.length > 0) {
      try {
        const { ContentModel } = await import('../models/Content/Content');
        let storedCount = 0;
        for (const post of fbPosts) {
          const likeCount = post.likes?.summary?.total_count ?? 0;
          const commentCount = post.comments?.summary?.total_count ?? 0;
          const shareCount = post.shares?.count ?? 0;
          const caption = post.message || post.story || '';
          const publishedAt = new Date(post.created_time);
          const engagementRate = followersCount > 0
            ? ((likeCount + commentCount + shareCount) / followersCount) * 100
            : 0;

          await ContentModel.findOneAndUpdate(
            { workspaceId: account.workspaceId, 'contentData.id': post.id },
            {
              $set: {
                workspaceId: account.workspaceId,
                accountId,
                platform: 'facebook',
                type: post.full_picture ? 'image' : 'text',
                title: caption.substring(0, 100) || 'Facebook Post',
                description: caption,
                contentData: {
                  id: post.id,
                  message: post.message,
                  story: post.story,
                  created_time: post.created_time,
                  full_picture: post.full_picture,
                  permalink_url: post.permalink_url,
                  platform: 'facebook',
                },
                status: 'published',
                isImported: true,
                publishedAt,
                'metrics.likes': likeCount,
                'metrics.comments': commentCount,
                'metrics.shares': shareCount,
                'metrics.engagement': engagementRate,
                lastInsightsFetchedAt: new Date(),
                updatedAt: new Date(),
              },
              $setOnInsert: { createdAt: new Date() },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );
          storedCount++;
        }
        console.log(`[FB SYNC] Stored/updated ${storedCount} Facebook posts`);

        // Compute aggregate metrics from posts
        const totalLikes = fbPosts.reduce((s, p) => s + (p.likes?.summary?.total_count ?? 0), 0);
        const totalComments = fbPosts.reduce((s, p) => s + (p.comments?.summary?.total_count ?? 0), 0);
        const totalShares = fbPosts.reduce((s, p) => s + (p.shares?.count ?? 0), 0);
        const avgEngagement = followersCount > 0 && storedCount > 0
          ? ((totalLikes + totalComments + totalShares) / (followersCount * storedCount)) * 100
          : 0;

        await repo.updateMetrics(accountDbId, {
          followersCount,
          mediaCount: storedCount,
          totalLikes,
          totalComments,
          totalShares,
          engagementRate: avgEngagement,
          avgLikes: totalLikes / storedCount,
          avgComments: totalComments / storedCount,
        });
      } catch (postsErr: any) {
        console.warn(`[FB SYNC] Failed to store posts for ${accountId}:`, postsErr?.message);
      }
    }

    // 3. Write analytics metrics to Analytics collection
    try {
      const totalLikes = fbPosts.reduce((s, p) => s + (p.likes?.summary?.total_count ?? 0), 0);
      const totalComments = fbPosts.reduce((s, p) => s + (p.comments?.summary?.total_count ?? 0), 0);
      const totalShares = fbPosts.reduce((s, p) => s + (p.shares?.count ?? 0), 0);
      const analyticsMetrics = (analytics?.metrics ?? {}) as Record<string, number | undefined>;

      await analyticsService.recordMetrics({
        workspaceId: account.workspaceId.toString(),
        accountId,
        platform: 'facebook',
        date: new Date(),
        followers: followersCount,
        posts: fbPosts.length > 0 ? fbPosts.length : undefined,
        likes: totalLikes > 0 ? totalLikes : analyticsMetrics.likes,
        comments: totalComments > 0 ? totalComments : undefined,
        shares: totalShares > 0 ? totalShares : undefined,
        reach: analyticsMetrics.reach_total,                    // 28-day generic reach (page views)
        reachDay: analytics1d?.metrics?.reach_total,            // 1-day reach (page views today)
        reachWeek: analytics7d?.metrics?.reach_total,           // 7-day reach (page views this week)
        reachDays28: analyticsMetrics.reach_total,              // 28-day reach (same as generic)
        views: analyticsMetrics.impressions_total,
        engagement: analyticsMetrics.total_engagements,
        customMetrics: {
          facebook_reactions: analyticsMetrics.facebook_reactions,
          facebook_page_views: analyticsMetrics.facebook_page_views,
          video_views: analyticsMetrics.video_views,
          profile_visits: analyticsMetrics.profile_visits,
          // Store period-specific impressions for views card
          viewsDay: analytics1d?.metrics?.impressions_total,
          viewsWeek: analytics7d?.metrics?.impressions_total,
          viewsDays28: analyticsMetrics.impressions_total,
        },
      });
      console.log(`[FB SYNC] Wrote analytics for Facebook Page ${accountId}`);
    } catch (analyticsErr: any) {
      console.warn(`[FB SYNC] Failed to write analytics for ${accountId}:`, analyticsErr?.message);
    }

    // 4. Update today's row in the durable per-day store (facebookInsightsHistory).
    // This keeps the durable store fresh after every 2-hour repeatable sync so
    // dashboard reads are always served from MongoDB instead of hitting the API live.
    // Fire-and-forget — never blocks the return.
    (async () => {
      try {
        const { fetchAndPersistFacebookInsightsDaily } = await import('../features/facebook/analytics/facebookInsightsHistory');
        const today = new Date();
        const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
        await fetchAndPersistFacebookInsightsDaily(
          account.workspaceId.toString(),
          accountId,
          accessToken,
          todayStart,
          today
        );
        console.log(`[FB SYNC] Updated durable store for today (${todayStart.toISOString().slice(0, 10)})`);
      } catch (storeErr: any) {
        console.warn(`[FB SYNC] Durable store update failed for ${accountId}:`, storeErr?.message);
      }
    })();

    // Return the refreshed account
    const refreshed = await repo.findById(accountDbId);
    return refreshed || account;
  }
}

export const socialAccountService = new SocialAccountService();
