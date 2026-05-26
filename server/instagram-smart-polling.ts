import { IStorage } from './storage';
import { DashboardCache } from './dashboard-cache';
import { RealtimeService } from './services/realtime';
import InstagramApiService from './services/instagramApi';
import { ContentModel } from './models/Content/Content';
import { contentRepository } from './repositories/ContentRepository';

interface RateLimitTracker {
  requestCount: number;
  windowStart: number;
  lastRequest: number;
}

interface PollingConfig {
  accountId: string;
  workspaceId: string;
  accessToken: string;
  username: string;
  isActive: boolean;
  lastFollowerCount: number;
  lastMediaCount: number;
  lastEngagementData: any;
  consecutiveNoChanges: number;
  lastActivity: number;
}

export class InstagramSmartPolling {
  private storage: IStorage;
  private dashboardCache: DashboardCache;
  private pollingConfigs: Map<string, PollingConfig> = new Map();
  private rateLimitTrackers: Map<string, RateLimitTracker> = new Map();
  private pollingIntervals: Map<string, NodeJS.Timeout> = new Map();
  private requestHistory: Array<{ timestamp: number; accountId: string }> = [];

  // Instagram API rate limits: 200 requests per hour per user
  private readonly MAX_REQUESTS_PER_HOUR = 200;
  private readonly HOUR_IN_MS = 60 * 60 * 1000;

  // BALANCED polling intervals - Real-time updates with rate limit protection
  private readonly INTERVALS = {
    ACTIVE_USER: 5 * 60 * 1000,    // 5 minutes when user is active
    NORMAL: 10 * 60 * 1000,       // 10 minutes normal
    REDUCED: 30 * 60 * 1000,      // 30 minutes when no changes
    MINIMAL: 60 * 60 * 1000,      // 1 hour when inactive  
    NIGHT: 120 * 60 * 1000        // 2 hours during night hours
  };

  constructor(storage: IStorage) {
    this.storage = storage;
    this.dashboardCache = new DashboardCache(storage);
    this.requestHistory = []; // Initialize request history
    this.initializePolling();
  }

  /**
   * Initialize polling for all active Instagram accounts
   */
  private async initializePolling(): Promise<void> {
    try {
      console.log('[SMART POLLING] Initializing Instagram polling system...');

      // Get all workspaces and their Instagram accounts
      const allAccounts = await this.getAllInstagramAccounts();

      for (const account of allAccounts) {
        await this.setupAccountPolling(account);
      }

      console.log(`[SMART POLLING] ✅ Initialized polling for ${allAccounts.length} Instagram accounts`);
    } catch (error) {
      console.error('[SMART POLLING] ❌ Failed to initialize polling:', error);
    }
  }

  /**
   * Get all Instagram accounts across all workspaces
   */
  private async getAllInstagramAccounts(): Promise<any[]> {
    try {
      const allAccounts: any[] = [];
      console.log('[SMART POLLING] Discovering Instagram accounts across all workspaces...');

      // Get ALL workspaces by discovering from social accounts (better approach)
      let allWorkspaces: any[] = [];

      try {
        // First try to get all social accounts to discover workspaces
        const allSocialAccounts = await this.storage.getAllSocialAccounts();
        console.log(`[SMART POLLING] Found ${allSocialAccounts.length} total social accounts`);

        // Extract unique workspace IDs from social accounts
        const workspaceIds = [...new Set(allSocialAccounts.map(acc => acc.workspaceId))];
        console.log(`[SMART POLLING] Found ${workspaceIds.length} unique workspace IDs from social accounts`);

        // Get workspace details for each workspace ID
        for (const workspaceId of workspaceIds) {
          try {
            const workspace = await this.storage.getWorkspace(workspaceId);
            if (workspace) {
              allWorkspaces.push(workspace);
              console.log(`[SMART POLLING] Found workspace: ${workspace.name || workspaceId}`);
            }
          } catch (error) {
            console.log(`[SMART POLLING] Could not get workspace ${workspaceId}:`, (error as any).message);
          }
        }
      } catch (error) {
        console.log('[SMART POLLING] Fallback: trying common user IDs...');
        // Fallback: Get ALL workspaces by trying multiple user IDs (workaround since getAllWorkspaces doesn't exist)
        const userIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]; // Try more user IDs

        for (const userId of userIds) {
          try {
            const userWorkspaces = await this.storage.getWorkspacesByUserId(userId.toString());
            if (userWorkspaces.length > 0) {
              allWorkspaces = allWorkspaces.concat(userWorkspaces);
              console.log(`[SMART POLLING] Found ${userWorkspaces.length} workspaces for user ${userId}`);
            }
            // Continue with other user IDs
          } catch (error) {
            // Continue with other user IDs
          }
        }
      }

      // Remove duplicates based on workspace ID
      const uniqueWorkspaces = allWorkspaces.filter((workspace, index, self) =>
        index === self.findIndex(w => w.id === workspace.id)
      );

      allWorkspaces = uniqueWorkspaces;
      console.log(`[SMART POLLING] Found ${allWorkspaces.length} total unique workspaces to scan`);

      // Scan each workspace for Instagram accounts
      for (const workspace of allWorkspaces) {
        try {
          console.log(`[SMART POLLING] Scanning workspace: ${workspace.id} (${workspace.name || 'Unnamed'})`);

          // Use internal method that returns decrypted tokens
          const accounts = await (this.storage as any).getSocialAccountsWithTokensInternal(workspace.id.toString());
          const instagramAccounts = accounts.filter((acc: any) =>
            acc.platform === 'instagram' &&
            acc.accessToken &&
            acc.username // Has basic data
          );

          if (instagramAccounts.length > 0) {
            console.log(`[SMART POLLING] Found ${instagramAccounts.length} Instagram accounts in workspace ${workspace.id}`);

            for (const account of instagramAccounts) {
              allAccounts.push({
                id: account.id,
                accountId: account.accountId || account.id,
                workspaceId: workspace.id.toString(),
                username: account.username,
                platform: account.platform,
                accessToken: account.accessToken,
                isActive: true, // Force active for polling
                followersCount: account.followersCount || 0,
                mediaCount: account.mediaCount || 0
              });
              console.log(`[SMART POLLING] Added account: @${account.username} (Token length: ${account.accessToken?.length || 0})`);
            }
          }
        } catch (workspaceError) {
          console.error(`[SMART POLLING] Error scanning workspace ${workspace.id}:`, workspaceError);
          // Continue with other workspaces
        }
      }

      console.log(`[SMART POLLING] Total Instagram accounts found across all workspaces: ${allAccounts.length}`);
      return allAccounts;
    } catch (error) {
      console.error('[SMART POLLING] Error getting Instagram accounts:', error);
      return [];
    }
  }

  /**
   * Setup polling for a specific Instagram account
   */
  async setupAccountPolling(account: any): Promise<void> {
    if (!account.accessToken || account.platform !== 'instagram' || !account.isActive) {
      return;
    }

    const config: PollingConfig = {
      accountId: account.accountId || account.id,
      workspaceId: account.workspaceId,
      accessToken: account.accessToken,
      username: account.username,
      isActive: true,
      lastFollowerCount: account.followersCount || 0,
      lastMediaCount: account.mediaCount || 0,
      lastEngagementData: null,
      consecutiveNoChanges: 0,
      lastActivity: Date.now()
    };

    const existingConfig = this.pollingConfigs.get(config.accountId);
    const tokenChanged = !existingConfig || existingConfig.accessToken !== config.accessToken;

    this.pollingConfigs.set(config.accountId, config);
    this.initializeRateLimit(config.accountId);

    if (tokenChanged) {
      console.log(`[SMART POLLING] ✅ Setup polling for @${config.username} (${config.accountId}) - ${existingConfig ? 'Token refreshed' : 'New account'}`);
      // Start polling immediately only if token changed or new account
      await this.startPollingForAccount(config.accountId);
    }
  }

  /**
   * Initialize rate limit tracking for an account
   */
  private initializeRateLimit(accountId: string): void {
    this.rateLimitTrackers.set(accountId, {
      requestCount: 0,
      windowStart: Date.now(),
      lastRequest: 0
    });
  }

  /**
   * BULLETPROOF rate limiting check - Multiple safety layers
   */
  private canMakeRequest(accountId: string): boolean {
    const now = Date.now();

    // Layer 1: Global rate limiting (across all accounts)
    this.cleanupRequestHistory();
    if (this.requestHistory.length >= this.MAX_REQUESTS_PER_HOUR) {
      console.log(`[SMART POLLING] 🚫 GLOBAL rate limit reached: ${this.requestHistory.length}/200 requests in last hour`);
      return false;
    }

    // Layer 2: Per-account rate limiting  
    const tracker = this.rateLimitTrackers.get(accountId);
    if (!tracker) return false;

    // Reset window if hour has passed
    if (now - tracker.windowStart >= this.HOUR_IN_MS) {
      tracker.requestCount = 0;
      tracker.windowStart = now;
    }

    // Check per-account limit (10% of total to reserve quota for automation)
    const maxPerAccount = Math.floor(this.MAX_REQUESTS_PER_HOUR / 10); // 20 requests max per account for analytics
    if (tracker.requestCount >= maxPerAccount) {
      console.log(`[SMART POLLING] 🚫 Account rate limit reached for ${accountId}: ${tracker.requestCount}/${maxPerAccount}`);
      return false;
    }

    // Layer 3: Minimum gap enforcement (10x safety: 3 minutes minimum)
    const minGap = (this.HOUR_IN_MS / this.MAX_REQUESTS_PER_HOUR) * 10; // 3 minutes minimum between requests
    if (now - tracker.lastRequest < minGap) {
      console.log(`[SMART POLLING] ⏱️ Too soon for ${accountId}, waiting ${Math.ceil((minGap - (now - tracker.lastRequest)) / 1000)}s`);
      return false;
    }

    return true;
  }

  /**
   * Clean up old requests from history (older than 1 hour)
   */
  private cleanupRequestHistory(): void {
    const now = Date.now();
    this.requestHistory = this.requestHistory.filter(
      req => now - req.timestamp < this.HOUR_IN_MS
    );
  }

  /**
   * Record an API request for rate limiting
   */
  private recordRequest(accountId: string): void {
    const tracker = this.rateLimitTrackers.get(accountId);
    if (tracker) {
      tracker.requestCount++;
      tracker.lastRequest = Date.now();
    }
  }

  /**
   * Record a request in global history for rate limiting tracking
   */
  private recordRequestHistory(accountId: string): void {
    const now = Date.now();
    this.requestHistory.push({ timestamp: now, accountId });
    this.cleanupRequestHistory();
  }

  /**
   * Calculate adaptive polling interval based on various factors
   */
  private calculatePollingInterval(config: PollingConfig): number {
    const now = Date.now();
    const timeSinceLastActivity = now - config.lastActivity;
    const currentHour = new Date().getHours();

    // Night hours (11 PM - 6 AM) - reduce polling
    if (currentHour >= 23 || currentHour <= 6) {
      return this.INTERVALS.NIGHT;
    }

    // User inactive for more than 30 minutes
    if (timeSinceLastActivity > 30 * 60 * 1000) {
      return this.INTERVALS.MINIMAL;
    }

    // No changes detected for a while - reduce frequency
    if (config.consecutiveNoChanges >= 5) {
      return this.INTERVALS.REDUCED;
    }

    // User recently active (within 10 minutes) - extended for better responsiveness
    if (timeSinceLastActivity < 10 * 60 * 1000) {
      return this.INTERVALS.ACTIVE_USER;
    }

    // Default interval
    return this.INTERVALS.NORMAL;
  }

  /**
   * Start polling for a specific account
   */
  private async startPollingForAccount(accountId: string): Promise<void> {
    const config = this.pollingConfigs.get(accountId);
    if (!config) return;

    // Clear existing timeout/interval
    const existingInterval = this.pollingIntervals.get(accountId);
    if (existingInterval) {
      clearTimeout(existingInterval);
    }

    const pollOnce = async () => {
      try {
        if (!this.canMakeRequest(accountId)) {
          // Schedule next poll with rate limit consideration
          const nextInterval = this.calculatePollingInterval(config);
          const handle = setTimeout(pollOnce, Math.max(nextInterval, 20000)); // At least 20 seconds
          this.pollingIntervals.set(accountId, handle);
          return;
        }

        await this.pollAccountData(accountId);

        // Schedule next poll
        const nextInterval = this.calculatePollingInterval(config);
        const handle = setTimeout(pollOnce, nextInterval);
        this.pollingIntervals.set(accountId, handle);

      } catch (error) {
        console.error(`[SMART POLLING] Error polling ${config.username}:`, error);
        // Retry with exponential backoff
        const handle = setTimeout(pollOnce, this.INTERVALS.REDUCED);
        this.pollingIntervals.set(accountId, handle);
      }
    };

    // Start polling
    pollOnce();
  }

  /**
   * Poll data for a specific account
   */
  private async pollAccountData(accountId: string): Promise<void> {
    const config = this.pollingConfigs.get(accountId);
    if (!config) return;

    try {
      console.log(`[SMART POLLING] 🔄 Polling data for @${config.username}...`);
      console.log(`[SMART POLLING] TOKEN CHECK: Length=${config.accessToken?.length}, Prefix=${config.accessToken?.substring(0, 5)}...`);

      // Record the API request
      this.recordRequest(accountId);
      this.recordRequestHistory(accountId);

      console.log(`[SMART POLLING] Using COMPREHENSIVE BATCH for @${config.username}`);

      // 1. Fetch comprehensive metrics (Account + Insights + Media) in minimal calls
      const metrics = await InstagramApiService.getComprehensiveMetrics(
        config.accessToken,
        config.accountId
      );

      const newFollowerCount = metrics.account.followers_count;
      const mediaCount = metrics.account.media_count;
      const realAccountType = metrics.account.account_type;
      const profilePictureUrl = metrics.account.profile_picture_url || null;

      console.log(`[SMART POLLING] 🔍 Batch Data Received:`, { newFollowerCount, mediaCount, realAccountType });

      // Check if this is a business account
      const isBusinessAccount = realAccountType === 'BUSINESS' || realAccountType === 'CREATOR' || !!metrics.insights.reach;

      console.log(`[SMART POLLING] Account @${config.username} - Final Business Status: ${isBusinessAccount} (API: ${realAccountType})`);

      // 2. Process engagement metrics from the same batch data
      const engagementMetrics = {
        totalLikes: metrics.aggregated.totalLikes,
        totalComments: metrics.aggregated.totalComments,
        totalShares: metrics.aggregated.totalShares,
        totalSaves: metrics.aggregated.totalSaves,
        totalReach: metrics.aggregated.totalReach,
        avgLikes: Math.round(metrics.aggregated.totalLikes / (metrics.recentMedia.length || 1)),
        avgComments: Math.round(metrics.aggregated.totalComments / (metrics.recentMedia.length || 1)),
        avgReach: Math.round(metrics.aggregated.totalReach / (metrics.recentMedia.length || 1)),
        engagementRate: metrics.aggregated.averageEngagementRate
      };

      // ⭐ FIX: ALWAYS update shares/saves if we have ANY data (even if other metrics haven't changed)
      const hasChanges = newFollowerCount !== config.lastFollowerCount ||
        mediaCount !== config.lastMediaCount ||
        this.hasEngagementChanges(config, engagementMetrics);

      // ⭐ FIX: Force update if we have NEW shares/saves data (even if they're the same values)
      const hasSharesSavesData = engagementMetrics.totalShares > 0 || engagementMetrics.totalSaves > 0;

      // ⭐ CRITICAL: Always save if we have shares/saves data OR if other metrics changed
      if (hasChanges || hasSharesSavesData) {
        const changes = [];
        if (newFollowerCount !== config.lastFollowerCount) {
          changes.push(`followers: ${config.lastFollowerCount} → ${newFollowerCount}`);
        }
        if (mediaCount !== config.lastMediaCount) {
          changes.push(`posts: ${config.lastMediaCount} → ${mediaCount}`);
        }
        if (this.hasEngagementChanges(config, engagementMetrics)) {
          changes.push('engagement metrics updated');
        }
        if (hasSharesSavesData) {
          changes.push(`shares/saves updated: ${engagementMetrics.totalShares}/${engagementMetrics.totalSaves}`);
        }

        console.log(`[SMART POLLING] 📊 Changes detected for @${config.username}: ${changes.join(', ')}`);
        console.log(`[SMART POLLING] 💾 Saving to database - shares: ${engagementMetrics.totalShares}, saves: ${engagementMetrics.totalSaves}`);

        // ⭐ KEY FIX: Fetch authoritative Account Reach (28 days) to prevent overwriting with estimates
        let authoritativeReach = 0;
        if (isBusinessAccount) {
          try {
            // Prioritize: 1. Account Reach (28 days/week), 2. Aggregated Reach (if Account Reach failed/zero)
            const accountReach = metrics.insights?.reach || 0;
            const aggregatedReach = metrics.aggregated?.totalReach || 0;

            authoritativeReach = accountReach > 0 ? accountReach : aggregatedReach;

            console.log(`[SMART POLLING] Authoritative Reach fetched: ${authoritativeReach} (Account: ${accountReach}, Aggregated: ${aggregatedReach})`);
          } catch (e: any) {
            console.error('[SMART POLLING] Failed to compute authoritative reach', e);
          }
        }

        const writeTotalLikes = engagementMetrics.totalLikes || 0;
        const writeTotalComments = engagementMetrics.totalComments || 0;
        const writeTotalShares = engagementMetrics.totalShares || 0;
        const writeTotalSaves = engagementMetrics.totalSaves || 0;
        const writeAvgLikes = engagementMetrics.avgLikes || 0;
        const writeAvgComments = engagementMetrics.avgComments || 0;
        const writeAvgEngagement = engagementMetrics.engagementRate || 0;

        // Use authoritative reach if available, otherwise 0
        let finalReach = authoritativeReach > 0 ? authoritativeReach : 0;

        // P2-FIX: LIFETIME REACH RESTORATION
        // Check DB for aggregated reach from all posts to prevent overwriting lifetime total with 28-day snapshot
        try {
          const dbMetrics = await contentRepository.getAggregatedMetrics(config.workspaceId);
          if (dbMetrics.totalReach > finalReach) {
            console.log(`[SMART POLLING] Restoring Lifetime Reach: ${dbMetrics.totalReach} > ${finalReach} (Snapshot)`);
            finalReach = dbMetrics.totalReach;
          }
        } catch (dbError) {
          console.error('[SMART POLLING] Failed to aggregate DB metrics for reach check', dbError);
        }

        // 🔍 DEBUG: Log the EXACT update object being sent
        const updateObject = {
          followersCount: newFollowerCount,
          mediaCount: mediaCount,
          accountType: realAccountType, // ⭐ FIX: Save real account type from Instagram API
          isBusinessAccount: isBusinessAccount, // ⭐ FIX: Update business account flag
          avgLikes: writeAvgLikes,
          avgComments: writeAvgComments,
          avgReach: engagementMetrics.avgReach,
          engagementRate: writeAvgEngagement,
          totalLikes: writeTotalLikes,
          totalComments: writeTotalComments,
          totalReach: finalReach, // ⭐ KEY FIX: Use authoritative reach
          avgEngagement: writeAvgEngagement,
          totalShares: writeTotalShares,
          totalSaves: writeTotalSaves,
          profilePictureUrl: profilePictureUrl,
          // Demographics mapping (New features from Batch API)
          audienceCity: metrics.demographics?.audienceCity || metrics.insights?.audience_city || {},
          audienceCountry: metrics.demographics?.audienceCountry || metrics.insights?.audience_country || {},
          audienceGenderAge: metrics.demographics?.audienceGenderAge || metrics.insights?.audience_gender_age || {},
          audienceActiveTime: metrics.demographics?.audienceActiveTime || metrics.insights?.audience_active_time || {},
          lastSyncAt: new Date()
        };

        console.log(`[SMART POLLING] 🔍 UPDATE OBJECT:`, JSON.stringify({
          totalShares: updateObject.totalShares,
          totalSaves: updateObject.totalSaves,
          totalLikes: updateObject.totalLikes,
          totalComments: updateObject.totalComments
        }));

        // Update database with ALL available metrics INCLUDING real account type
        await this.updateAccountData(config, updateObject);

        // Clear dashboard cache to force refresh
        this.dashboardCache.clearWorkspaceCache(config.workspaceId);

        // Broadcast WebSocket event to notify frontend of data update
        RealtimeService.broadcastToWorkspace(config.workspaceId, 'instagram_data_update', {
          accountId: config.accountId,
          username: config.username,
          followersCount: newFollowerCount,
          mediaCount: mediaCount,
          accountType: realAccountType,
          avgLikes: engagementMetrics.avgLikes,
          avgComments: engagementMetrics.avgComments,
          engagementRate: engagementMetrics.engagementRate,
          totalLikes: engagementMetrics.totalLikes,
          totalComments: engagementMetrics.totalComments,
          totalShares: engagementMetrics.totalShares || 0,
          totalSaves: engagementMetrics.totalSaves || 0,
          lastSyncAt: new Date(),
          changes: changes
        });

        console.log(`[SMART POLLING] 📡 Broadcasted instagram_data_update event to workspace ${config.workspaceId}`);

        // Reset consecutive no-changes counter and update tracked values
        config.consecutiveNoChanges = 0;
        config.lastFollowerCount = newFollowerCount;
        config.lastMediaCount = mediaCount;
        config.lastEngagementData = engagementMetrics;

        console.log(`[SMART POLLING] ✅ Updated @${config.username} - ALL metrics synchronized`);

        // 3. Sync media items to ContentModel for historical tracking
        if (metrics.recentMedia && metrics.recentMedia.length > 0) {
          await this.syncMediaItems(config, metrics.recentMedia);
        }
      } else {
        config.consecutiveNoChanges++;
        console.log(`[SMART POLLING] 📊 No changes for @${config.username} (${config.consecutiveNoChanges} consecutive)`);
      }

    } catch (error) {
      console.error(`[SMART POLLING] ❌ Failed to poll @${config.username}:`, error);

      // Handle specific errors
      if ((error as any).message?.includes('rate limit')) {
        console.log(`[SMART POLLING] Rate limited for @${config.username}, backing off...`);
      }
    }
  }

  /**
   * Sync recent media to our ContentModel for historical tracking
   */
  private async syncMediaItems(config: PollingConfig, mediaItems: any[]): Promise<void> {
    if (!mediaItems || mediaItems.length === 0) return;

    try {
      console.log(`[SMART POLLING] 📥 Syncing ${mediaItems.length} posts to ContentModel for @${config.username}...`);

      const ops = mediaItems.map((media: any) => ({
        updateOne: {
          filter: { 'contentData.externalId': media.id },
          update: {
            $set: {
              workspaceId: config.workspaceId,
              accountId: config.accountId,
              platform: 'instagram',
              type: media.media_type === 'VIDEO' ? 'video' : 'image',
              title: media.caption ? media.caption.substring(0, 50) + (media.caption.length > 50 ? '...' : '') : 'Instagram Post',
              description: media.caption || '',
              contentData: {
                externalId: media.id,
                mediaUrl: media.media_url,
                permalink: media.permalink,
                thumbnailUrl: media.thumbnail_url || media.media_url,
                mediaType: media.media_type
              },
              status: 'published',
              publishedAt: new Date(media.timestamp),
              metrics: {
                likes: media.like_count || 0,
                comments: media.comments_count || 0,
                shares: media.insights?.shares || 0,
                saves: media.insights?.saved || 0,
                reach: media.insights?.reach || 0,
                impressions: media.insights?.impressions || 0
              },
              updatedAt: new Date()
            },
            $setOnInsert: {
              createdAt: new Date(),
              creditsUsed: 0
            }
          },
          upsert: true
        }
      }));

      if (ops.length > 0) {
        // Import ContentModel - it is already imported at the top of the file
        await ContentModel.bulkWrite(ops);
        console.log(`[SMART POLLING] ✅ Synced ${ops.length} posts to ContentModel`);
      }
    } catch (error) {
      console.error('[SMART POLLING] ❌ Failed to sync ContentModel:', error);
    }
  }

  /**
  private async fetchEngagementMetrics(config: PollingConfig, accessToken: string, isBusinessAccount: boolean = false): Promise<any> {
    // This is now redundant as it's merged into pollAccountData via getComprehensiveMetrics
    return { avgLikes: 0, avgComments: 0, avgReach: 0, engagementRate: 0, totalLikes: 0, totalComments: 0, totalReach: 0, avgEngagement: 0, totalShares: 0, totalSaves: 0 };
  }

  /**
   * Check if engagement metrics have changed
   */
  private hasEngagementChanges(config: PollingConfig, newMetrics: any): boolean {
    if (!config.lastEngagementData) return true;

    const old = config.lastEngagementData;
    return old.avgLikes !== newMetrics.avgLikes ||
      old.avgComments !== newMetrics.avgComments ||
      old.totalLikes !== newMetrics.totalLikes ||
      old.totalComments !== newMetrics.totalComments ||
      old.totalShares !== newMetrics.totalShares ||
      old.totalSaves !== newMetrics.totalSaves;
  }

  /**
   * Update account data in storage and save daily analytics snapshot
   */
  private async updateAccountData(config: PollingConfig, updates: any): Promise<void> {
    try {
      // Find the account in storage and update it
      const accounts = await this.storage.getSocialAccountsByWorkspace(config.workspaceId);
      const account = accounts.find((acc: any) =>
        acc.platform === 'instagram' &&
        (acc.accountId === config.accountId || acc.id === config.accountId)
      );

      if (account) {
        // Save old totals for delta calculation
        const oldAccountData = { ...account };

        await this.storage.updateSocialAccount(account.id, updates);

        // 📊 SAVE DAILY ANALYTICS SNAPSHOT - Building Real Historical Data!
        // Pass oldAccountData to calculate deltas
        await this.recordDailyAnalytics(config, updates, oldAccountData);
      }
    } catch (error) {
      console.error('[SMART POLLING] Failed to update account data:', error);
    }
  }

  /**
   * Record comprehensive daily analytics snapshot for historical data tracking
   */
  private async recordDailyAnalytics(config: PollingConfig, metrics: any, oldAccountData?: any): Promise<void> {
    try {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0); // Start of day in UTC

      // Check if we already have an analytics record for today
      const existingAnalytics = await this.storage.getAnalytics(
        config.workspaceId,
        'instagram',
        2 // Look back 2 days to be safe with time zones
      );

      const todayRecord = existingAnalytics.find((record: any) => {
        const recordDate = new Date(record.date);
        recordDate.setUTCHours(0, 0, 0, 0);
        return recordDate.getTime() === today.getTime();
      });

      // Calculate DELTAS for continuous metrics (Likes, Comments)
      // If we have old data, delta = new - old.
      // If no old data (first run), delta = new (spike for day 1).
      const oldLikes = oldAccountData?.totalLikes || 0;
      const oldComments = oldAccountData?.totalComments || 0;
      const oldShares = oldAccountData?.totalShares || 0;
      const oldSaves = oldAccountData?.totalSaves || 0;
      const oldReach = oldAccountData?.totalReach || 0;

      const newLikes = metrics.totalLikes || 0;
      const newComments = metrics.totalComments || 0;
      const newShares = metrics.totalShares || 0;
      const newSaves = metrics.totalSaves || 0;
      const newReach = metrics.totalReach || 0;

      const deltaLikes = newLikes - oldLikes;
      const deltaComments = newComments - oldComments;
      const deltaShares = newShares - oldShares;
      const deltaSaves = newSaves - oldSaves;

      // For Reach, store the current total or daily value - sticking to total for now as it's what we have
      const reachToStore = newReach;

      const contentScore = this.calculateContentScore(metrics);
      const postFrequency = this.calculatePostFrequency(metrics);
      const engagementPatterns = this.calculateEngagementPatterns(metrics);
      const reachEfficiency = this.calculateReachEfficiency(metrics);

      // Current daily accumulated values (if record exists)
      const currentDailyLikes = todayRecord?.likes || 0;
      const currentDailyComments = todayRecord?.comments || 0;
      const currentDailyShares = todayRecord?.shares || 0;

      // Handle the case where we might be re-running on the same day without a real change in total
      // If delta is 0, we add 0. 
      // BUT: If the server restarted, oldAccountData might be from DB which is already updated?
      // No, updateAccountData calls this BEFORE updating DB? 
      // Wait, line 1085: await this.storage.updateSocialAccount(account.id, updates);
      // Then calls recordDailyAnalytics. 
      // So 'account' variable holds the OLD data (fetched before update). Correct.

      const analyticsData = {
        workspaceId: config.workspaceId,
        platform: 'instagram',
        date: today,
        followers: metrics.followersCount || 0,
        engagement: metrics.engagementRate || 0,
        reach: reachToStore,
        // Store ACCUMULATED daily volume for interactions
        likes: currentDailyLikes + (deltaLikes > 0 ? deltaLikes : 0),
        comments: currentDailyComments + (deltaComments > 0 ? deltaComments : 0),
        shares: currentDailyShares + (deltaShares > 0 ? deltaShares : 0),
        views: 0,
        metrics: {
          posts: metrics.mediaCount || 0,
          avgLikes: metrics.avgLikes || 0,
          avgComments: metrics.avgComments || 0,
          avgReach: metrics.avgReach || 0,
          avgEngagement: metrics.avgEngagement || 0,
          saved: metrics.totalSaves || 0,
          contentScore: contentScore,
          postFrequency: postFrequency,
          engagementRate: metrics.engagementRate || 0,
          reachEfficiency: reachEfficiency,
          likesPerPost: engagementPatterns.likesPerPost,
          commentsPerPost: engagementPatterns.commentsPerPost,
          engagementDistribution: engagementPatterns.distribution,
          performanceIndicators: {
            contentPerformance: contentScore.rating,
            engagementTrend: 'stable'
          },
          username: config.username,
          accountId: config.accountId,
          lastSyncAt: new Date(),
          dayOfWeek: today.getUTCDay()
        }
      };

      if (!todayRecord) {
        await this.storage.createAnalytics(analyticsData);
        console.log(`[COMPREHENSIVE ANALYTICS] 📊 Created daily snapshot for @${config.username} (Delta Likes: ${deltaLikes})`);
      } else {
        // PRESERVE START-OF-DAY BASELINE: Do not overwrite the foundational metrics for today
        analyticsData.followers = todayRecord.followers;
        analyticsData.reach = todayRecord.reach;
        analyticsData.engagement = todayRecord.engagement;
        if (analyticsData.metrics) {
          analyticsData.metrics.posts = todayRecord.metrics?.posts || todayRecord.posts || 0;
        }

        await this.storage.updateAnalytics(todayRecord.id, analyticsData);
        console.log(`[COMPREHENSIVE ANALYTICS] 🔄 Updated today's snapshot for @${config.username} (Delta Likes: ${deltaLikes})`);
      }

    } catch (error) {
      console.error('[COMPREHENSIVE ANALYTICS] Failed to record daily analytics:', error);
    }
  }

  /**
   * Calculate comprehensive content score based on multiple factors
   */
  private calculateContentScore(metrics: any): { score: number, rating: string } {
    let score = 0;

    // Engagement Rate Score (40% weight)
    const engagementScore = Math.min(metrics.engagementRate / 10, 10);
    score += engagementScore * 0.4;

    // Post Activity Score (30% weight) 
    const activityScore = Math.min((metrics.mediaCount || 0) / 10, 10);
    score += activityScore * 0.3;

    // Reach Efficiency Score (20% weight)
    const followers = metrics.followersCount || 1;
    const reachEfficiency = Math.min((metrics.totalReach || 0) / followers / 5, 10);
    score += reachEfficiency * 0.2;

    // Interaction Quality Score (10% weight)
    const avgInteractionScore = Math.min((metrics.avgLikes + metrics.avgComments) / 5, 10);
    score += avgInteractionScore * 0.1;

    const finalScore = Math.min(score, 10);

    let rating = 'Poor';
    if (finalScore >= 9) rating = 'Exceptional';
    else if (finalScore >= 7.5) rating = 'Excellent';
    else if (finalScore >= 6) rating = 'Very Good';
    else if (finalScore >= 4.5) rating = 'Good';
    else if (finalScore >= 3) rating = 'Fair';

    return { score: finalScore, rating };
  }

  /**
   * Calculate post frequency patterns
   */
  private calculatePostFrequency(metrics: any): { postsPerWeek: number, frequency: string } {
    const totalPosts = metrics.mediaCount || 0;
    // Estimate based on account age (assuming account is active for at least 30 days)
    const estimatedWeeks = 4; // Default estimation
    const postsPerWeek = Math.round((totalPosts / estimatedWeeks) * 10) / 10;

    let frequency = 'Low';
    if (postsPerWeek >= 7) frequency = 'Very High';
    else if (postsPerWeek >= 5) frequency = 'High';
    else if (postsPerWeek >= 3) frequency = 'Moderate';
    else if (postsPerWeek >= 1) frequency = 'Regular';

    return { postsPerWeek, frequency };
  }

  /**
   * Calculate engagement patterns and distribution
   */
  private calculateEngagementPatterns(metrics: any): any {
    const totalPosts = Math.max(metrics.mediaCount || 1, 1);
    const likesPerPost = (metrics.totalLikes || 0) / totalPosts;
    const commentsPerPost = (metrics.totalComments || 0) / totalPosts;

    const distribution = {
      likes: Math.round((metrics.totalLikes || 0) / ((metrics.totalLikes || 0) + (metrics.totalComments || 0)) * 100) || 0,
      comments: Math.round((metrics.totalComments || 0) / ((metrics.totalLikes || 0) + (metrics.totalComments || 0)) * 100) || 0
    };

    return {
      likesPerPost: Math.round(likesPerPost * 10) / 10,
      commentsPerPost: Math.round(commentsPerPost * 10) / 10,
      distribution
    };
  }

  /**
   * Calculate reach efficiency metrics
   */
  private calculateReachEfficiency(metrics: any): { percentage: number, rating: string } {
    const followers = Math.max(metrics.followersCount || 1, 1);
    const reach = metrics.totalReach || 0;
    const percentage = Math.round((reach / followers) * 100);

    let rating = 'Poor';
    if (percentage >= 80) rating = 'Exceptional';
    else if (percentage >= 60) rating = 'Excellent';
    else if (percentage >= 40) rating = 'Good';
    else if (percentage >= 20) rating = 'Fair';

    return { percentage, rating };
  }

  /**
   * Get current hour for activity tracking
   */
  private getCurrentHour(): number {
    return new Date().getHours();
  }

  /**
   * Notify system of user activity to adjust polling
   */
  updateUserActivity(accountId: string): void {
    const config = this.pollingConfigs.get(accountId);
    if (config) {
      config.lastActivity = Date.now();
      console.log(`[SMART POLLING] 👤 User activity detected for @${config.username}`);
    }
  }


  /**
   * Force immediate poll for an account (respecting rate limits)
   */
  async forcePoll(accountId: string): Promise<boolean> {
    if (this.canMakeRequest(accountId)) {
      await this.pollAccountData(accountId);
      return true;
    }
    return false;
  }

  /**
   * Stop polling for an account
   */
  stopPolling(accountId: string): void {
    const interval = this.pollingIntervals.get(accountId);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(accountId);
    }
    this.pollingConfigs.delete(accountId);
    this.rateLimitTrackers.delete(accountId);
    console.log(`[SMART POLLING] ⏹️ Stopped polling for account ${accountId}`);
  }

  /**
   * Stop all polling
   */
  stopAllPolling(): void {
    this.pollingIntervals.forEach((interval) => {
      clearInterval(interval);
    });
    this.pollingIntervals.clear();
    this.pollingConfigs.clear();
    this.rateLimitTrackers.clear();
    console.log('[SMART POLLING] ⏹️ Stopped all polling');
  }



  /**
   * Get current polling status for all accounts
   */
  getPollingStatus(): any {
    const accounts = Array.from(this.pollingConfigs.values()).map(config => {
      const interval = this.calculatePollingInterval(config);
      const nextPollTime = new Date(config.lastActivity + interval);
      const nextPollIn = Math.max(0, nextPollTime.getTime() - Date.now());

      return {
        id: config.accountId,
        username: config.username,
        isActive: config.isActive,
        lastPolled: new Date(config.lastActivity),
        nextPollIn: nextPollIn,
        interval: interval,
        requestsToday: 0 // Simplified for now
      };
    });

    return {
      totalAccounts: this.pollingConfigs.size,
      activeAccounts: Array.from(this.pollingConfigs.values()).filter(config => config.isActive).length,
      totalRequestsToday: this.requestHistory?.length || 0,
      rateLimitRemaining: Math.max(0, this.MAX_REQUESTS_PER_HOUR - (this.requestHistory?.length || 0)),
      accounts: accounts
    };
  }
}
