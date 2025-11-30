import mongoose from 'mongoose';
import crypto from 'crypto';
import { IStorage } from './storage';

const PerformanceSnapshotModel = mongoose.model('PerformanceSnapshot');
const AIStoryCacheModel = mongoose.model('AIStoryCache');

export interface SnapshotMetrics {
  followers: number;
  following: number;
  posts: number;
  reach: number;
  impressions: number;
  engagement: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  engagementRate: number;
  growthRate: number;
  contentScore: number;
}

export interface PerformanceComparison {
  metric: string;
  current: number;
  previous: number;
  change: number;
  changePercent: number;
  trend: 'up' | 'down' | 'stable';
  significance: 'major' | 'moderate' | 'minor';
}

export class PerformanceSnapshotService {
  private storage: IStorage;

  constructor(storage: IStorage) {
    this.storage = storage;
  }

  /**
   * Create a performance snapshot for a social account
   */
  async createSnapshot(
    workspaceId: string,
    socialAccountId: string,
    platform: string,
    username: string,
    snapshotType: 'daily' | 'weekly' | 'monthly',
    metrics: SnapshotMetrics
  ): Promise<any> {
    try {
      const snapshotDate = this.getSnapshotDate(snapshotType);
      
      // Get previous snapshot to calculate growth
      const previousSnapshot = await this.getPreviousSnapshot(
        workspaceId,
        socialAccountId,
        snapshotType
      );

      const followerGrowth = previousSnapshot 
        ? ((metrics.followers - previousSnapshot.followers) / previousSnapshot.followers) * 100 
        : 0;
      
      const reachGrowth = previousSnapshot 
        ? ((metrics.reach - previousSnapshot.reach) / previousSnapshot.reach) * 100 
        : 0;
      
      const engagementGrowth = previousSnapshot 
        ? ((metrics.engagement - previousSnapshot.engagement) / previousSnapshot.engagement) * 100 
        : 0;

      const snapshot = new PerformanceSnapshotModel({
        workspaceId,
        socialAccountId,
        platform,
        username,
        snapshotType,
        snapshotDate,
        ...metrics,
        followerGrowth,
        reachGrowth,
        engagementGrowth,
        rawMetrics: metrics
      });

      await snapshot.save();
      console.log(`[SNAPSHOT] Created ${snapshotType} snapshot for @${username}:`, {
        followers: metrics.followers,
        followerGrowth: followerGrowth.toFixed(2) + '%',
        reach: metrics.reach,
        engagement: metrics.engagement
      });

      return snapshot;
    } catch (error: any) {
      console.error(`[SNAPSHOT] Error creating snapshot:`, error.message);
      throw error;
    }
  }

  /**
   * Get the appropriate snapshot date based on type
   */
  private getSnapshotDate(snapshotType: 'daily' | 'weekly' | 'monthly'): Date {
    const now = new Date();
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 4, 0, 0); // 4 AM

    if (snapshotType === 'weekly') {
      // Set to Monday 4 AM of current week
      const day = date.getDay();
      const diff = date.getDate() - day + (day === 0 ? -6 : 1);
      date.setDate(diff);
    } else if (snapshotType === 'monthly') {
      // Set to 1st day of month 4 AM
      date.setDate(1);
    }

    return date;
  }

  /**
   * Get previous snapshot for comparison
   */
  private async getPreviousSnapshot(
    workspaceId: string,
    socialAccountId: string,
    snapshotType: 'daily' | 'weekly' | 'monthly'
  ): Promise<any> {
    try {
      const currentDate = this.getSnapshotDate(snapshotType);
      
      const snapshot = await PerformanceSnapshotModel.findOne({
        workspaceId,
        socialAccountId,
        snapshotType,
        snapshotDate: { $lt: currentDate }
      }).sort({ snapshotDate: -1 }).lean();

      return snapshot;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get snapshots for a period with historical comparison
   */
  async getSnapshotsWithComparison(
    workspaceId: string,
    socialAccountId: string,
    period: 'day' | 'week' | 'month'
  ): Promise<{
    current: any;
    previous: any;
    comparisons: PerformanceComparison[];
    hasSignificantChanges: boolean;
  }> {
    try {
      const snapshotType = period === 'day' ? 'daily' : period === 'week' ? 'weekly' : 'monthly';
      
      const snapshots = await PerformanceSnapshotModel.find({
        workspaceId,
        socialAccountId,
        snapshotType
      })
      .sort({ snapshotDate: -1 })
      .limit(2)
      .lean();

      if (snapshots.length === 0) {
        return {
          current: null,
          previous: null,
          comparisons: [],
          hasSignificantChanges: false
        };
      }

      const current = snapshots[0];
      const previous = snapshots.length > 1 ? snapshots[1] : null;

      const comparisons = previous ? this.calculateComparisons(current, previous) : [];
      const hasSignificantChanges = comparisons.some(c => c.significance === 'major' || c.significance === 'moderate');

      return {
        current,
        previous,
        comparisons,
        hasSignificantChanges
      };
    } catch (error: any) {
      console.error(`[SNAPSHOT] Error getting snapshots with comparison:`, error.message);
      return {
        current: null,
        previous: null,
        comparisons: [],
        hasSignificantChanges: false
      };
    }
  }

  /**
   * Calculate detailed comparisons between snapshots
   */
  private calculateComparisons(current: any, previous: any): PerformanceComparison[] {
    const metrics = [
      { key: 'followers', label: 'Followers', thresholds: { major: 10, moderate: 5 } },
      { key: 'reach', label: 'Reach', thresholds: { major: 30, moderate: 15 } },
      { key: 'engagement', label: 'Engagement', thresholds: { major: 25, moderate: 10 } },
      { key: 'engagementRate', label: 'Engagement Rate', thresholds: { major: 20, moderate: 10 } },
      { key: 'posts', label: 'Posts', thresholds: { major: 50, moderate: 20 } },
      { key: 'likes', label: 'Likes', thresholds: { major: 30, moderate: 15 } },
      { key: 'comments', label: 'Comments', thresholds: { major: 40, moderate: 20 } },
    ];

    return metrics.map(({ key, label, thresholds }) => {
      const currentValue = current[key] || 0;
      const previousValue = previous[key] || 0;
      const change = currentValue - previousValue;
      const changePercent = previousValue !== 0 ? (change / previousValue) * 100 : 0;

      let trend: 'up' | 'down' | 'stable' = 'stable';
      if (changePercent > 1) trend = 'up';
      else if (changePercent < -1) trend = 'down';

      let significance: 'major' | 'moderate' | 'minor' = 'minor';
      const absChangePercent = Math.abs(changePercent);
      if (absChangePercent >= thresholds.major) significance = 'major';
      else if (absChangePercent >= thresholds.moderate) significance = 'moderate';

      return {
        metric: label,
        current: currentValue,
        previous: previousValue,
        change,
        changePercent,
        trend,
        significance
      };
    });
  }

  /**
   * Check if data has changed since last snapshot
   */
  async hasDataChanged(
    workspaceId: string,
    socialAccountId: string,
    currentMetrics: SnapshotMetrics
  ): Promise<boolean> {
    try {
      const latestDaily = await PerformanceSnapshotModel.findOne({
        workspaceId,
        socialAccountId,
        snapshotType: 'daily'
      }).sort({ snapshotDate: -1 }).lean();

      if (!latestDaily) return true;

      // Check if any significant metric has changed
      const threshold = 0.01; // 1% change threshold
      const metricsToCheck = ['followers', 'reach', 'engagement', 'posts'];

      for (const metric of metricsToCheck) {
        const oldValue = latestDaily[metric] || 0;
        const newValue = (currentMetrics as any)[metric] || 0;
        
        if (oldValue === 0 && newValue > 0) return true;
        if (oldValue > 0) {
          const changePercent = Math.abs((newValue - oldValue) / oldValue);
          if (changePercent > threshold) return true;
        }
      }

      return false;
    } catch (error) {
      return true; // Assume changed if we can't verify
    }
  }

  /**
   * Get or create cached AI stories
   */
  async getCachedAIStories(
    workspaceId: string,
    period: 'day' | 'week' | 'month',
    metricsData: any
  ): Promise<any | null> {
    // TEMPORARY: COMPLETELY DISABLE CACHE - FORCE FRESH GENERATION
    console.log(`[AI STORY CACHE] 🚫 CACHE DISABLED - Force fresh generation for workspace ${workspaceId}, period ${period}`);
    return null;
    
    /* DISABLED FOR DEBUGGING
    try {
      const dataHash = this.hashMetrics(metricsData);
      const now = new Date();

      const cache = await AIStoryCacheModel.findOne({
        workspaceId,
        period,
        dataHash,
        expiresAt: { $gt: now },
        isValid: true
      }).lean();

      if (cache) {
        console.log(`[AI STORY CACHE] Cache hit for workspace ${workspaceId}, period ${period}`);
        return cache;
      }

      console.log(`[AI STORY CACHE] Cache miss for workspace ${workspaceId}, period ${period}`);
      return null;
    } catch (error: any) {
      console.error(`[AI STORY CACHE] Error retrieving cache:`, error.message);
      return null;
    }
    */
  }

  /**
   * Save AI stories to cache
   */
  async cacheAIStories(
    workspaceId: string,
    period: 'day' | 'week' | 'month',
    metricsData: any,
    stories: any[],
    insights: any[]
  ): Promise<void> {
    try {
      const dataHash = this.hashMetrics(metricsData);
      const expiresAt = this.getNext4AM();

      // Invalidate old cache entries for this workspace and period
      await AIStoryCacheModel.updateMany(
        { workspaceId, period },
        { $set: { isValid: false } }
      );

      const cache = new AIStoryCacheModel({
        workspaceId,
        period,
        dataHash,
        stories,
        insights,
        expiresAt
      });

      await cache.save();
      console.log(`[AI STORY CACHE] Cached stories for workspace ${workspaceId}, period ${period}, expires at ${expiresAt}`);
    } catch (error: any) {
      console.error(`[AI STORY CACHE] Error caching stories:`, error.message);
    }
  }

  /**
   * Invalidate all caches (called at 4 AM)
   */
  async invalidateExpiredCaches(): Promise<void> {
    try {
      const now = new Date();
      const result = await AIStoryCacheModel.updateMany(
        { expiresAt: { $lte: now } },
        { $set: { isValid: false } }
      );

      console.log(`[AI STORY CACHE] Invalidated ${result.modifiedCount} expired cache entries`);
    } catch (error: any) {
      console.error(`[AI STORY CACHE] Error invalidating caches:`, error.message);
    }
  }

  /**
   * Create hash of metrics for change detection
   */
  private hashMetrics(metrics: any): string {
    const relevantData = JSON.stringify({
      followers: metrics.followers || 0,
      reach: metrics.reach || 0,
      engagement: metrics.engagement || 0,
      posts: metrics.posts || 0,
      engagementRate: metrics.engagementRate || 0
    });
    return crypto.createHash('md5').update(relevantData).digest('hex');
  }

  /**
   * Get next 4 AM timestamp
   */
  private getNext4AM(): Date {
    const now = new Date();
    const next4AM = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      4,
      0,
      0,
      0
    );

    // If current time is past 4 AM, set to tomorrow 4 AM
    if (now.getHours() >= 4) {
      next4AM.setDate(next4AM.getDate() + 1);
    }

    return next4AM;
  }

  /**
   * Cleanup old snapshots (keep last 90 days of daily, 52 weeks of weekly, 24 months of monthly)
   */
  async cleanupOldSnapshots(): Promise<void> {
    try {
      const now = new Date();

      // Delete daily snapshots older than 90 days
      const dailyCutoff = new Date(now);
      dailyCutoff.setDate(dailyCutoff.getDate() - 90);

      const dailyResult = await PerformanceSnapshotModel.deleteMany({
        snapshotType: 'daily',
        snapshotDate: { $lt: dailyCutoff }
      });

      // Delete weekly snapshots older than 52 weeks
      const weeklyCutoff = new Date(now);
      weeklyCutoff.setDate(weeklyCutoff.getDate() - (52 * 7));

      const weeklyResult = await PerformanceSnapshotModel.deleteMany({
        snapshotType: 'weekly',
        snapshotDate: { $lt: weeklyCutoff }
      });

      // Delete monthly snapshots older than 24 months
      const monthlyCutoff = new Date(now);
      monthlyCutoff.setMonth(monthlyCutoff.getMonth() - 24);

      const monthlyResult = await PerformanceSnapshotModel.deleteMany({
        snapshotType: 'monthly',
        snapshotDate: { $lt: monthlyCutoff }
      });

      console.log(`[SNAPSHOT CLEANUP] Deleted old snapshots:`, {
        daily: dailyResult.deletedCount,
        weekly: weeklyResult.deletedCount,
        monthly: monthlyResult.deletedCount
      });
    } catch (error: any) {
      console.error(`[SNAPSHOT CLEANUP] Error:`, error.message);
    }
  }
}


