import { IStorage } from './storage';

interface CachedDashboardData {
  totalPosts: number;
  totalReach: number;
  engagementRate: number;
  topPlatform: string;
  followers: number;
  impressions: number;
  accountUsername: string;
  totalLikes: number;
  totalComments: number;
  mediaCount: number;
  lastUpdated: Date;
}

export class DashboardCache {
  private cache = new Map<string, CachedDashboardData>();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  constructor(private storage: IStorage) {}

  // Get cached data immediately - NEVER wait for database
  getCachedDataSync(workspaceId: string): CachedDashboardData | null {
    const cached = this.cache.get(workspaceId);
    
    if (cached) {
      console.log('[CACHE SYNC] Returning cached data instantly');
      return cached;
    }

    console.log('[CACHE SYNC] No cache found');
    return null;
  }

  // Async method only for initial population - not used in API routes
  async getCachedData(workspaceId: string): Promise<CachedDashboardData | null> {
    // First check sync cache
    const syncCache = this.getCachedDataSync(workspaceId);
    if (syncCache) return syncCache;

    // Only use database for initial population
    try {
      console.log('[CACHE] Initial database population for workspace:', workspaceId);
      const accounts = await this.storage.getSocialAccountsByWorkspace(workspaceId);
      const instagramAccount = accounts.find(acc => acc.platform === 'instagram' && acc.accessToken);
      
      if (instagramAccount) {
        const account = instagramAccount as any;
        const dashboardData: CachedDashboardData = {
          totalPosts: account.mediaCount || 0,
          totalReach: account.totalReach || 0,
          engagementRate: account.avgEngagement || 0,
          topPlatform: 'instagram',
          followers: account.followersCount || account.followers || 0,
          impressions: account.totalReach || 0,
          accountUsername: account.username || '',
          totalLikes: account.totalLikes || 0,
          totalComments: account.totalComments || 0,
          mediaCount: account.mediaCount || 0,
          lastUpdated: new Date()
        };

        this.cache.set(workspaceId, dashboardData);
        console.log('[CACHE] Initial cache populated from database');
        return dashboardData;
      }
    } catch (error) {
      console.log('[CACHE] Initial database population failed');
    }

    return null;
  }

  // Update cache with fresh data
  updateCache(workspaceId: string, data: Partial<CachedDashboardData>): void {
    const existing = this.cache.get(workspaceId) || {
      totalPosts: 0,
      totalReach: 0,
      engagementRate: 0,
      topPlatform: 'instagram',
      followers: 0,
      impressions: 0,
      accountUsername: '',
      totalLikes: 0,
      totalComments: 0,
      mediaCount: 0,
      lastUpdated: new Date()
    };

    const updated = {
      ...existing,
      ...data,
      lastUpdated: new Date()
    };

    this.cache.set(workspaceId, updated);
    console.log('[CACHE] Updated dashboard cache for workspace:', workspaceId);
  }

  // Clear all cache to force fresh data
  clearCache(): void {
    this.cache.clear();
    console.log('[CACHE] All dashboard cache cleared');
  }

  // Clear cache for specific workspace
  clearWorkspaceCache(workspaceId: string): void {
    this.cache.delete(workspaceId);
    console.log('[CACHE] Cleared cache for workspace:', workspaceId);
  }

  // Check if cache is still valid
  private isCacheValid(lastUpdated: Date): boolean {
    const now = new Date().getTime();
    const cacheTime = lastUpdated.getTime();
    return (now - cacheTime) < this.CACHE_DURATION;
  }

  // Get minimal placeholder data for immediate response
  getPlaceholderData(): CachedDashboardData {
    return {
      totalPosts: 0,
      totalReach: 0,
      engagementRate: 0,
      topPlatform: 'none',
      followers: 0,
      impressions: 0,
      accountUsername: '',
      totalLikes: 0,
      totalComments: 0,
      mediaCount: 0,
      lastUpdated: new Date()
    };
  }
}