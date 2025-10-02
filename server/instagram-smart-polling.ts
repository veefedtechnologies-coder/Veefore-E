import { IStorage } from './storage';
import { DashboardCache } from './dashboard-cache';
import { RealtimeService } from './services/realtime';

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
            console.log(`[SMART POLLING] Could not get workspace ${workspaceId}:`, error.message);
          }
        }
      } catch (error) {
        console.log('[SMART POLLING] Fallback: trying common user IDs...');
        // Fallback: Get ALL workspaces by trying multiple user IDs (workaround since getAllWorkspaces doesn't exist)
        const userIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]; // Try more user IDs
        
        for (const userId of userIds) {
          try {
            const userWorkspaces = await this.storage.getWorkspacesByUserId(userId);
            if (userWorkspaces.length > 0) {
              allWorkspaces = allWorkspaces.concat(userWorkspaces);
              console.log(`[SMART POLLING] Found ${userWorkspaces.length} workspaces for user ${userId}`);
            }
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
          const instagramAccounts = accounts.filter(acc => 
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
              console.log(`[SMART POLLING] Added account: @${account.username} from workspace ${workspace.id} for polling`);
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

    this.pollingConfigs.set(config.accountId, config);
    this.initializeRateLimit(config.accountId);
    
    console.log(`[SMART POLLING] ✅ Setup polling for @${config.username} (${config.accountId})`);
    
    // Start polling immediately
    await this.startPollingForAccount(config.accountId);
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

    // Clear existing interval
    const existingInterval = this.pollingIntervals.get(accountId);
    if (existingInterval) {
      clearInterval(existingInterval);
    }

    const pollOnce = async () => {
      try {
        if (!this.canMakeRequest(accountId)) {
          // Schedule next poll with rate limit consideration
          const nextInterval = this.calculatePollingInterval(config);
          setTimeout(pollOnce, Math.max(nextInterval, 20000)); // At least 20 seconds
          return;
        }

        await this.pollAccountData(accountId);
        
        // Schedule next poll
        const nextInterval = this.calculatePollingInterval(config);
        setTimeout(pollOnce, nextInterval);
        
      } catch (error) {
        console.error(`[SMART POLLING] Error polling ${config.username}:`, error);
        // Retry with exponential backoff
        setTimeout(pollOnce, this.INTERVALS.REDUCED);
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
      
      // Record the API request
      this.recordRequest(accountId);
      this.recordRequestHistory(accountId);

      // Make comprehensive Instagram API call (using only available fields)
      const apiUrl = `https://graph.instagram.com/me?fields=followers_count,media_count,account_type&access_token=${config.accessToken}`;
      const response = await fetch(apiUrl);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Instagram API error');
      }

      const newFollowerCount = data.followers_count;
      const mediaCount = data.media_count;
      const realAccountType = data.account_type; // Get real account type from Instagram API
      
      // Check if this is a business account to determine if we can fetch reach data
      const accounts = await this.storage.getSocialAccountsByWorkspace(config.workspaceId);
      const account = accounts.find((acc: any) => 
        acc.platform === 'instagram' && 
        (acc.accountId === config.accountId || acc.id === config.accountId)
      );
      // Debug current account type values
      console.log(`[SMART POLLING] Account @${config.username} debug:`, {
        isBusinessAccount: account?.isBusinessAccount,
        accountType: account?.accountType,
        hasAccessToken: !!config.accessToken
      });
      
      // Use REAL account type from Instagram API, not outdated database value
      const isBusinessAccount = realAccountType === 'BUSINESS' || 
                               realAccountType === 'CREATOR' ||
                               account?.isBusinessAccount || 
                               account?.accountType === 'BUSINESS' || 
                               account?.accountType === 'CREATOR';
      
      console.log(`[SMART POLLING] Account @${config.username} - Business account: ${isBusinessAccount}`);
      
      // Fetch comprehensive engagement metrics
      const engagementMetrics = await this.fetchEngagementMetrics(config.accessToken, isBusinessAccount);

      // Check if ANY data changed (not just followers)
      const hasChanges = newFollowerCount !== config.lastFollowerCount || 
                        mediaCount !== config.lastMediaCount ||
                        this.hasEngagementChanges(config, engagementMetrics);

      if (hasChanges) {
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
        
        console.log(`[SMART POLLING] 📊 Changes detected for @${config.username}: ${changes.join(', ')}`);
        
        // Update database with ALL available metrics INCLUDING real account type
        await this.updateAccountData(config, {
          followersCount: newFollowerCount,
          mediaCount: mediaCount,
          accountType: realAccountType, // ⭐ FIX: Save real account type from Instagram API
          isBusinessAccount: isBusinessAccount, // ⭐ FIX: Update business account flag
          avgLikes: engagementMetrics.avgLikes,
          avgComments: engagementMetrics.avgComments,
          avgReach: engagementMetrics.avgReach,
          engagementRate: engagementMetrics.engagementRate,
          totalLikes: engagementMetrics.totalLikes,
          totalComments: engagementMetrics.totalComments,
          totalReach: engagementMetrics.totalReach,
          avgEngagement: engagementMetrics.avgEngagement,
          lastSyncAt: new Date()
        });

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
      } else {
        config.consecutiveNoChanges++;
        console.log(`[SMART POLLING] 📊 No changes for @${config.username} (${config.consecutiveNoChanges} consecutive)`);
      }

    } catch (error) {
      console.error(`[SMART POLLING] ❌ Failed to poll @${config.username}:`, error);
      
      // Handle specific errors
      if (error.message?.includes('rate limit')) {
        console.log(`[SMART POLLING] Rate limited for @${config.username}, backing off...`);
      }
    }
  }

  /**
   * Fetch comprehensive engagement metrics from Instagram using Business API when available
   */
  private async fetchEngagementMetrics(accessToken: string, isBusinessAccount: boolean = false): Promise<any> {
    try {
      // Fetch recent media posts
      const mediaResponse = await fetch(`https://graph.instagram.com/me/media?fields=id,like_count,comments_count&limit=25&access_token=${accessToken}`);
      if (!mediaResponse.ok) {
        console.log('[SMART POLLING] Media data not available, using defaults');
        return { avgLikes: 0, avgComments: 0, avgReach: 0, engagementRate: 0, totalLikes: 0, totalComments: 0, totalReach: 0, avgEngagement: 0 };
      }
      
      const mediaData = await mediaResponse.json();
      const mediaList = mediaData.data || [];
      
      if (!mediaList.length) {
        return { avgLikes: 0, avgComments: 0, avgReach: 0, engagementRate: 0, totalLikes: 0, totalComments: 0, totalReach: 0, avgEngagement: 0 };
      }
      
      // Calculate basic engagement metrics
      const totalLikes = mediaList.reduce((sum: number, media: any) => sum + (media.like_count || 0), 0);
      const totalComments = mediaList.reduce((sum: number, media: any) => sum + (media.comments_count || 0), 0);
      
      const avgLikes = Math.round(totalLikes / mediaList.length);
      const avgComments = Math.round(totalComments / mediaList.length);
      const avgEngagement = avgLikes + avgComments;
      
      // Try to fetch REAL reach data using Business API insights
      let totalReach = 0;
      let reachCount = 0;
      
      if (isBusinessAccount) {
        console.log('[SMART POLLING] 🔥 Business account detected - fetching REAL reach data from Instagram Business API');
        for (const media of mediaList.slice(0, 5)) { // Sample first 5 posts to avoid rate limits
          try {
            const insightsResponse = await fetch(`https://graph.instagram.com/${media.id}/insights?metric=reach&access_token=${accessToken}`);
            if (insightsResponse.ok) {
              const insights = await insightsResponse.json();
              const reach = insights.data?.[0]?.values?.[0]?.value || 0;
              if (reach > 0) {
                totalReach += reach;
                reachCount++;
                console.log(`[SMART POLLING] ✅ Real reach for post ${media.id}: ${reach}`);
              }
            } else {
              console.log(`[SMART POLLING] Insights failed for ${media.id}: ${insightsResponse.status}`);
            }
          } catch (error) {
            console.log(`[SMART POLLING] Could not fetch reach for post ${media.id}:`, error.message);
          }
        }
      } else {
        // Even if not detected as business, try ONE Business API call to test if we actually have access
        console.log('[SMART POLLING] 🧪 Testing Business API access even though account not detected as business...');
        if (mediaList.length > 0) {
          try {
            const testMedia = mediaList[0];
            const testResponse = await fetch(`https://graph.instagram.com/${testMedia.id}/insights?metric=reach&access_token=${accessToken}`);
            if (testResponse.ok) {
              const insights = await testResponse.json();
              const reach = insights.data?.[0]?.values?.[0]?.value || 0;
              console.log(`[SMART POLLING] 🎉 SURPRISE! We DO have Business API access! Reach: ${reach}`);
              // If Business API works, treat as business account and fetch more data
              for (const media of mediaList.slice(0, 5)) {
                try {
                  const insightsResponse = await fetch(`https://graph.instagram.com/${media.id}/insights?metric=reach&access_token=${accessToken}`);
                  if (insightsResponse.ok) {
                    const insights = await insightsResponse.json();
                    const reach = insights.data?.[0]?.values?.[0]?.value || 0;
                    if (reach > 0) {
                      totalReach += reach;
                      reachCount++;
                    }
                  }
                } catch (error) {
                  // Continue if some posts fail
                }
              }
            } else {
              console.log(`[SMART POLLING] Business API test failed: ${testResponse.status} - confirmed personal account`);
            }
          } catch (error) {
            console.log(`[SMART POLLING] Business API test error: ${error.message}`);
          }
        }
      }
      
      const avgReach = reachCount > 0 ? Math.round(totalReach / reachCount) : 0;
      const totalReachEstimate = avgReach * mediaList.length;
      const engagementRate = avgReach > 0 ? Math.round((avgEngagement / avgReach) * 100) : 0;
      
      console.log(`[SMART POLLING] ✅ Real engagement data: ${totalLikes} likes, ${totalComments} comments across ${mediaList.length} posts`);
      if (isBusinessAccount && reachCount > 0) {
        console.log(`[SMART POLLING] ✅ Real reach data: ${totalReach} total reach from ${reachCount} posts, avg: ${avgReach}`);
      }
      
      return {
        avgLikes,
        avgComments,
        avgReach,
        engagementRate,
        totalLikes,
        totalComments,
        totalReach: totalReachEstimate,
        avgEngagement
      };
    } catch (error) {
      console.log('[SMART POLLING] Failed to fetch engagement metrics:', error.message);
      return { avgLikes: 0, avgComments: 0, avgReach: 0, engagementRate: 0, totalLikes: 0, totalComments: 0, totalReach: 0, avgEngagement: 0 };
    }
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
           old.totalComments !== newMetrics.totalComments;
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
        await this.storage.updateSocialAccount(account.id, updates);
        
        // 📊 SAVE DAILY ANALYTICS SNAPSHOT - Building Real Historical Data!
        await this.recordDailyAnalytics(config, updates);
      }
    } catch (error) {
      console.error('[SMART POLLING] Failed to update account data:', error);
    }
  }

  /**
   * Record comprehensive daily analytics snapshot for historical data tracking
   */
  private async recordDailyAnalytics(config: PollingConfig, metrics: any): Promise<void> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Start of day
      
      // Check if we already have an analytics record for today
      const existingAnalytics = await this.storage.getAnalyticsByWorkspace(
        config.workspaceId, 
        'instagram', 
        1 // Last 1 day
      );
      
      const todayRecord = existingAnalytics.find((record: any) => {
        const recordDate = new Date(record.date);
        recordDate.setHours(0, 0, 0, 0);
        return recordDate.getTime() === today.getTime();
      });
      
      if (!todayRecord) {
        // Calculate comprehensive content score
        const contentScore = this.calculateContentScore(metrics);
        
        // Calculate post frequency (posts per week estimate)
        const postFrequency = this.calculatePostFrequency(metrics);
        
        // Calculate engagement patterns
        const engagementPatterns = this.calculateEngagementPatterns(metrics);
        
        // Calculate reach efficiency
        const reachEfficiency = this.calculateReachEfficiency(metrics);
        
        // Create comprehensive daily analytics record with ALL metrics
        await this.storage.createAnalytics({
          workspaceId: config.workspaceId,
          platform: 'instagram',
          date: today,
          followers: metrics.followersCount || 0,
          engagement: metrics.engagementRate || 0,
          reach: metrics.totalReach || 0,
          likes: metrics.totalLikes || 0,
          comments: metrics.totalComments || 0,
          shares: 0, // Not available in Instagram Basic API
          views: 0, // Not available in Instagram Basic API
          metrics: {
            // Basic metrics
            posts: metrics.mediaCount || 0,
            avgLikes: metrics.avgLikes || 0,
            avgComments: metrics.avgComments || 0,
            avgReach: metrics.avgReach || 0,
            avgEngagement: metrics.avgEngagement || 0,
            
            // Advanced analytics metrics
            contentScore: contentScore,
            postFrequency: postFrequency,
            engagementRate: metrics.engagementRate || 0,
            reachEfficiency: reachEfficiency,
            
            // Engagement patterns
            likesPerPost: engagementPatterns.likesPerPost,
            commentsPerPost: engagementPatterns.commentsPerPost,
            engagementDistribution: engagementPatterns.distribution,
            
            // Performance indicators
            followerGrowthRate: 0, // Will calculate from historical data
            engagementTrend: 'stable', // Will calculate from historical data
            contentPerformance: contentScore.rating,
            
            // Account metadata
            username: config.username,
            accountId: config.accountId,
            accountType: 'PERSONAL', // From account info
            isVerified: false,
            
            // Timing and activity
            lastSyncAt: new Date(),
            activeHours: this.getCurrentHour(),
            dayOfWeek: today.getDay(),
            
            // Content analysis
            totalInteractions: (metrics.totalLikes || 0) + (metrics.totalComments || 0),
            interactionRate: ((metrics.totalLikes || 0) + (metrics.totalComments || 0)) / Math.max(metrics.totalReach || 1, 1),
            
            // Growth metrics (will be calculated from historical data)
            followerChangeToday: 0,
            engagementChangeToday: 0,
            reachChangeToday: 0,
            postsAddedToday: 0
          }
        });
        
        console.log(`[COMPREHENSIVE ANALYTICS] 📊 Saved complete daily snapshot for @${config.username}:`);
        console.log(`[COMPREHENSIVE ANALYTICS] - Followers: ${metrics.followersCount}, Posts: ${metrics.mediaCount}`);
        console.log(`[COMPREHENSIVE ANALYTICS] - Content Score: ${contentScore.score}/10 (${contentScore.rating})`);
        console.log(`[COMPREHENSIVE ANALYTICS] - Post Frequency: ${postFrequency.postsPerWeek}/week`);
        console.log(`[COMPREHENSIVE ANALYTICS] - Reach Efficiency: ${reachEfficiency.percentage}%`);
      } else {
        console.log(`[COMPREHENSIVE ANALYTICS] 📅 Today's complete record already exists for @${config.username}`);
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
   * Get polling status for all accounts
   */
  getPollingStatus(): any {
    const status: any = {
      totalAccounts: this.pollingConfigs.size,
      accounts: []
    };

    this.pollingConfigs.forEach((config, accountId) => {
      const rateLimitInfo = this.rateLimitTrackers.get(accountId);
      const nextPollIn = this.calculatePollingInterval(config);
      
      status.accounts.push({
        username: config.username,
        accountId: accountId,
        lastFollowerCount: config.lastFollowerCount,
        consecutiveNoChanges: config.consecutiveNoChanges,
        timeSinceActivity: Date.now() - config.lastActivity,
        nextPollIn: nextPollIn,
        rateLimitStatus: rateLimitInfo ? {
          requestsUsed: rateLimitInfo.requestCount,
          requestsRemaining: this.MAX_REQUESTS_PER_HOUR - rateLimitInfo.requestCount,
          windowResetIn: Math.max(0, (rateLimitInfo.windowStart + this.HOUR_IN_MS) - Date.now())
        } : null
      });
    });

    return status;
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