import { Router } from 'express';
import { analyticsController } from '../../controllers';
import { requireAuth } from '../../middleware/require-auth';
import { validateWorkspaceAccess } from '../../middleware/workspace-validation';
import { validateRequest } from '../../middleware/validation';
import { createDashboardRouter, RedisAnalyticsCache } from '../../features/analytics/api';
import { legacyDashboardService } from '../../features/analytics/bridge';
import { analyticsHistoryGuard, clampAnalyticsHistoryWindow, dashboardEntitlementGuard, enforceSinglePlatformForBasicPlans } from '../../middleware/apply-route-guards';
import { performanceBannerGuards, growthRecommendationGuards } from '../../middleware/ai-route-guards';
import { z } from 'zod';

const router = Router();

// Enterprise dashboard-oriented API (Phase 8), served from the app's existing
// analytics data via the legacy bridge so dashboards show REAL numbers today.
// (Swap to the Mongo rollup store once connectors emit events into the new
// pipeline — same API, no client changes.) Mounted first so the two-segment
// `/dashboards/:dashboardId` paths are handled here and not intercepted by the
// single-segment `/:analyticsId` route below.
//
// Response envelopes are cached in Redis (shared across instances) so repeated
// dashboard loads don't re-run the read store; the cache no-ops to fresh
// computation when Redis is unavailable.
// Built-in dashboards (overview, executive, audience, reach, engagement,
// content, publishing, insights) are available on ALL plans per the plan doc's
// Analytics tiers. Only the user-built "custom" dashboard (Dashboard Builder)
// is gated to Pro+ via dashboardEntitlementGuard(). The requested history
// window is clamped to the plan's analyticsHistoryDays so older data is never
// returned beyond the plan's allowance.
router.use(
  '/dashboards',
  requireAuth,
  clampAnalyticsHistoryWindow(),
  // Free plans get single-platform analytics only; the combined "All Platforms"
  // view is a Creator+ feature. Coerce the platforms filter server-side so a
  // crafted request can't merge Facebook + Instagram on a Free plan.
  enforceSinglePlatformForBasicPlans(),
  dashboardEntitlementGuard(),
  createDashboardRouter({ service: legacyDashboardService, cache: new RedisAnalyticsCache() })
);

// Best Time to Post endpoint — reads audience active-time from SocialAccount.
// Returns the 30-day averaged per-hour follower activity + 7×24 weekly grid.
// Also computes post-based grids (reach + engagement rate) from Content records.
router.get(
  '/best-time',
  requireAuth,
  validateWorkspaceAccess({ source: 'query' }),
  async (req: import('express').Request, res: import('express').Response) => {
    try {
      const workspaceId = (req as any).workspaceId ?? req.query.workspaceId as string
      const { socialAccountRepository } = await import('../../repositories/SocialAccountRepository')
      const accounts = await socialAccountRepository.findActiveByWorkspace(workspaceId)

      // ── TAB 1: audience online (Max Reach) ─────────────────────────────
      const combined: Record<string, number> = {}
      const weeklyGrid: Record<string, number> = {}

      for (const acc of accounts) {
        if (acc.platform !== 'instagram') continue
        const at = (acc as any).audienceActiveTime
        if (at && typeof at === 'object') {
          const obj: Record<string, number> = at instanceof Map ? Object.fromEntries(at) : at
          for (const [h, v] of Object.entries(obj)) {
            if (typeof v === 'number' && v > 0) combined[h] = (combined[h] ?? 0) + v
          }
        }
        const wt = (acc as any).audienceActiveTimeWeekly
        if (wt && typeof wt === 'object') {
          const wObj: Record<string, number> = wt instanceof Map ? Object.fromEntries(wt) : wt
          for (const [k, v] of Object.entries(wObj)) {
            if (typeof v === 'number' && v > 0) weeklyGrid[k] = (weeklyGrid[k] ?? 0) + v
          }
        }
      }

      // ── TABs 2 & 3: post-based grids ────────────────────────────────────
      // Reach grid (Boost Visibility) and engagement-rate grid (Drive Engagement)
      // computed from the last 90 days of published posts in this workspace.
      const reachSums: Record<string, number> = {}
      const reachCounts: Record<string, number> = {}
      const engSums: Record<string, number> = {}
      const engCounts: Record<string, number> = {}

      // Raw post inputs for the unified engine (collected once, reused).
      const enginePosts: Array<{ publishedAt: any; reach?: number; impressions?: number; views?: number; likes?: number; comments?: number; saves?: number; shares?: number }> = []

      try {
        const { ContentModel } = await import('../../models/Content/Content')
        const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        const posts = await ContentModel.find(
          {
            workspaceId,
            platform: 'instagram',
            publishedAt: { $gte: since30, $ne: null },
            $or: [{ 'metrics.reach': { $gt: 0 } }, { 'metrics.views': { $gt: 0 } }, { 'metrics.likes': { $gt: 0 } }]
          },
          { publishedAt: 1, 'metrics.reach': 1, 'metrics.views': 1, 'metrics.impressions': 1, 'metrics.likes': 1, 'metrics.comments': 1, 'metrics.saves': 1, 'metrics.shares': 1 }
        ).lean()

        for (const post of posts) {
          const pm = (post as any).metrics ?? {}
          enginePosts.push({
            publishedAt: (post as any).publishedAt,
            reach: pm.reach, impressions: pm.impressions, views: pm.views,
            likes: pm.likes, comments: pm.comments, saves: pm.saves, shares: pm.shares,
          })
          const date = new Date((post as any).publishedAt)
          const dow = date.getDay()
          const hour = date.getHours()
          const key = `${dow}_${hour}`
          const m = (post as any).metrics ?? {}

          // Impressions: prefer views (Meta's v18+ replacement for impressions),
          // then legacy impressions field, fallback to reach.
          const imp =
            m.views > 0 ? m.views
            : m.impressions > 0 ? m.impressions
            : m.reach ?? 0

          // Post-level engagement rate = (likes + comments + saves + shares) / reach × 100
          // Matches Hootsuite's formula — uses reach as denominator, not followers.
          const reach = m.reach ?? 0
          const engRate = reach > 0
            ? ((m.likes ?? 0) + (m.comments ?? 0) + (m.saves ?? 0) + (m.shares ?? 0)) / reach * 100
            : 0

          if (imp > 0) {
            reachSums[key] = (reachSums[key] ?? 0) + imp
            reachCounts[key] = (reachCounts[key] ?? 0) + 1
          }
          if (engRate > 0) {
            engSums[key] = (engSums[key] ?? 0) + engRate
            engCounts[key] = (engCounts[key] ?? 0) + 1
          }
        }
      } catch (_e) { /* non-fatal */ }

      const reachGrid: Record<string, number> = {}
      for (const [k, sum] of Object.entries(reachSums)) {
        reachGrid[k] = Math.round(sum / (reachCounts[k] ?? 1))
      }

      const engGrid: Record<string, number> = {}
      for (const [k, sum] of Object.entries(engSums)) {
        engGrid[k] = Math.round((sum / (engCounts[k] ?? 1)) * 10) / 10  // 1dp %
      }

      // ── Top slots for each grid ─────────────────────────────────────────
      const topSlotsFor = (grid: Record<string, number>, n = 5) =>
        Object.entries(grid)
          .sort((a, b) => b[1] - a[1])
          .slice(0, n)
          .map(([key, count]) => { const [dow, hour] = key.split('_').map(Number); return { dow, hour, count } })

      const hasData = Object.values(combined).some((v) => v > 0) || Object.values(weeklyGrid).some((v) => v > 0)

      // ── SMART TAB: unified best-time engine ─────────────────────────────
      // Fuses audience-online + engagement + reach into one recommendation with
      // a best day, best hour per day, and combined heatmap. Reuses the accounts
      // + posts already fetched above for tabs 1–3 (no duplicate DB round-trip).
      // Other consumers without that local data (AnalyticsService,
      // InsightsDataService, VeeGPT) call the shared bestTimeService.getSmartBestTime
      // instead, which does its own fetch — see server/services/bestTimeService.ts.
      const { computeBestTime } = await import('../../services/bestTimeEngine')
      const smart = computeBestTime({
        weeklyActive: weeklyGrid,
        hourlyActive: combined,
        posts: enginePosts,
      })

      return res.json({
        // Tab 1 — Max Reach (audience online)
        activeTime: combined,
        weeklyGrid,
        peakHours: Object.entries(combined).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([hour, count]) => ({ hour: parseInt(hour), count })),
        topDays: topSlotsFor(weeklyGrid),
        // Tab 2 — Boost Visibility (post reach by slot)
        reachGrid,
        topReachSlots: topSlotsFor(reachGrid),
        // Tab 3 — Drive Engagement (avg engagement rate by slot)
        engGrid,
        topEngSlots: topSlotsFor(engGrid),
        // SMART — unified recommendation (best day + best hour + combined grid)
        smart,
        hasData,
        hasPostData: Object.keys(reachGrid).length > 0 || Object.keys(engGrid).length > 0,
      })
    } catch (err) {
      return res.status(500).json({ error: 'Failed to load best time data' })
    }
  }
);

const AnalyticsIdParams = z.object({
  analyticsId: z.string().min(1),
});

const WorkspaceIdParams = z.object({
  workspaceId: z.string().min(1),
});

router.get('/workspace/:workspaceId',
  requireAuth,
  validateWorkspaceAccess({ source: 'params' }),
  validateRequest({ params: WorkspaceIdParams }),
  analyticsController.getByWorkspace
);

router.get('/workspace/:workspaceId/platform',
  requireAuth,
  validateWorkspaceAccess({ source: 'params' }),
  validateRequest({ params: WorkspaceIdParams }),
  analyticsController.getByPlatform
);

router.get('/workspace/:workspaceId/date-range',
  requireAuth,
  validateWorkspaceAccess({ source: 'params' }),
  validateRequest({ params: WorkspaceIdParams }),
  analyticsHistoryGuard(),
  analyticsController.getDateRange
);

router.get('/workspace/:workspaceId/performance-summary',
  requireAuth,
  validateWorkspaceAccess({ source: 'params' }),
  validateRequest({ params: WorkspaceIdParams }),
  analyticsController.getPerformanceSummary
);

router.get('/workspace/:workspaceId/daily',
  requireAuth,
  validateWorkspaceAccess({ source: 'params' }),
  validateRequest({ params: WorkspaceIdParams }),
  analyticsController.getDailyMetrics
);

/**
 * GET /workspace/:workspaceId/performance-overview?period=day|week|month
 *
 * Returns period-scoped Performance Overview data for the Home dashboard:
 *   - posts in the current period + previous period (for change %)
 *   - content score for current period + previous period (for change %)
 *   - top performer post in the current period (by engagement)
 *   - engagement rate for current period
 *
 * All data comes from the DB (Analytics + Content collections).
 * Zero live Meta API calls are made here.
 */
const PerformanceOverviewQuery = z.object({
  period: z.enum(['day', 'week', 'month']).optional().default('month'),
});

router.get('/workspace/:workspaceId/performance-overview',
  requireAuth,
  validateWorkspaceAccess({ source: 'params' }),
  validateRequest({ params: WorkspaceIdParams }),
  async (req: any, res) => {
    try {
      const { workspaceId } = req.params;
      const { period } = PerformanceOverviewQuery.parse(req.query);

      const days = period === 'day' ? 1 : period === 'week' ? 7 : 30;
      const now = new Date();

      // Current period window
      const currentStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      const currentEnd = now;

      // Previous period window (same length, directly before)
      const prevStart = new Date(currentStart.getTime() - days * 24 * 60 * 60 * 1000);
      const prevEnd = currentStart;

      const { ContentModel } = await import('../../models/Content/Content');
      const { analyticsService } = await import('../../services');
      const { socialAccountRepository } = await import('../../repositories/SocialAccountRepository');

      // ── Post counts (period-scoped from Content collection) ──────────────
      const [currentPostCount, previousPostCount] = await Promise.all([
        ContentModel.countDocuments({
          workspaceId,
          status: 'published',
          publishedAt: { $gte: currentStart, $lte: currentEnd },
        }),
        ContentModel.countDocuments({
          workspaceId,
          status: 'published',
          publishedAt: { $gte: prevStart, $lte: prevEnd },
        }),
      ]);

      // ── Top Performer post in current period ─────────────────────────────
      // Sorted by (likes + comments + saves + shares) descending
      const topPerformerPosts = await ContentModel.find({
        workspaceId,
        status: 'published',
        publishedAt: { $gte: currentStart, $lte: currentEnd },
        $or: [
          { 'metrics.likes': { $gt: 0 } },
          { 'metrics.comments': { $gt: 0 } },
          { 'metrics.views': { $gt: 0 } },
          { 'metrics.reach': { $gt: 0 } },
        ],
      })
        .sort({ 'metrics.likes': -1, 'metrics.comments': -1 })
        .limit(1)
        .lean();

      const topPost = topPerformerPosts[0];
      let topPerformer: null | {
        title: string;
        type: string;
        platform: string;
        likes: number;
        comments: number;
        shares: number;
        saves: number;
        views: number;
        reach: number;
        engagement: number;
        publishedAt: Date;
      } = null;

      if (topPost) {
        const m = (topPost as any).metrics || {};
        const engagement = (m.likes || 0) + (m.comments || 0) + (m.shares || 0) + (m.saves || 0);
        topPerformer = {
          title: (topPost as any).title || '',
          type: (topPost as any).type || 'post',
          platform: (topPost as any).platform || 'instagram',
          likes: m.likes || 0,
          comments: m.comments || 0,
          shares: m.shares || 0,
          saves: m.saves || 0,
          views: m.views || 0,
          reach: m.reach || 0,
          engagement,
          publishedAt: (topPost as any).publishedAt,
        };
      }

      // ── Engagement rate for current period ───────────────────────────────
      // Pulled from the latest Analytics record for the account(s) in this workspace
      const accounts = await socialAccountRepository.findActiveByWorkspace(workspaceId);
      const igAccounts = accounts.filter((a: any) => a.platform === 'instagram');

      let currentEngagementRate = 0;
      let previousEngagementRate = 0;

      if (igAccounts.length > 0) {
        // Use live engagementRate from the SocialAccount document (already computed by the polling system)
        const totalEng = igAccounts.reduce((sum: number, a: any) => sum + (a.engagementRate || a.avgEngagement || 0), 0);
        currentEngagementRate = igAccounts.length > 0 ? totalEng / igAccounts.length : 0;
      }

      // For the previous period, try to compute from the Analytics collection
      try {
        const { analyticsRepository } = await import('../../repositories/AnalyticsRepository');
        const activePlatforms = accounts.map((a: any) => a.platform);
        const prevAgg = await analyticsRepository.getAggregatedMetrics(workspaceId, prevStart, prevEnd, activePlatforms);
        if (prevAgg.avgEngagement > 0) {
          previousEngagementRate = prevAgg.avgEngagement;
        }
      } catch { /* non-fatal */ }

      // ── Content score (derived) ───────────────────────────────────────────
      // Score = weighted formula using engagement rate, activity and reach efficiency
      // same formula as the client-side calculateContentScore but now authoritative on server
      // Use InstagramFollowerSnapshot for followers so day/week/month all show the same consistent value.
      let totalFollowers = igAccounts.reduce((sum: number, a: any) => sum + (a.followersCount || 0), 0);
      try {
        const { InstagramFollowerSnapshotModel } = await import('../../models/Analytics');
        const igIds = igAccounts.map((a: any) => a.accountId).filter(Boolean);
        if (igIds.length > 0) {
          const snaps = await InstagramFollowerSnapshotModel.aggregate([
            { $match: { instagramUserId: { $in: igIds }, followerCount: { $gt: 0 } } },
            { $sort: { snapshotDate: -1 } },
            { $group: { _id: '$instagramUserId', followerCount: { $first: '$followerCount' } } },
          ]);
          if (snaps.length > 0) {
            totalFollowers = snaps.reduce((sum: number, s: any) => sum + (s.followerCount || 0), 0);
          }
        }
      } catch { /* non-fatal */ }
      const totalReach = igAccounts.reduce((sum: number, a: any) => sum + (a.totalReach || 0), 0);

      const computeContentScore = (posts: number, engRate: number, reach: number, followers: number): number => {
        const engagementScore = Math.min(engRate / 10, 10);
        const activityScore = Math.min(posts / 10, 10);
        const reachEff = followers > 0 ? Math.min((reach / followers) / 5, 10) : 0;
        const consistencyScore = Math.min(accounts.length * 2.5, 10);
        return Math.min(
          engagementScore * 0.4 + activityScore * 0.3 + reachEff * 0.2 + consistencyScore * 0.1,
          10
        );
      };

      const currentContentScore = computeContentScore(currentPostCount, currentEngagementRate, totalReach, totalFollowers);
      const previousContentScore = computeContentScore(previousPostCount, previousEngagementRate, totalReach, totalFollowers);

      const contentScoreChange = previousContentScore > 0
        ? ((currentContentScore - previousContentScore) / previousContentScore) * 100
        : 0;

      const postCountChange = previousPostCount > 0
        ? ((currentPostCount - previousPostCount) / previousPostCount) * 100
        : (currentPostCount > 0 ? 100 : 0);

      const engagementChange = previousEngagementRate > 0
        ? ((currentEngagementRate - previousEngagementRate) / previousEngagementRate) * 100
        : 0;

      res.json({
        success: true,
        data: {
          period,
          posts: {
            current: currentPostCount,
            previous: previousPostCount,
            changePercent: Number(postCountChange.toFixed(1)),
            isPositive: postCountChange >= 0,
          },
          contentScore: {
            current: Number(currentContentScore.toFixed(1)),
            previous: Number(previousContentScore.toFixed(1)),
            changePercent: Number(contentScoreChange.toFixed(1)),
            isPositive: contentScoreChange >= 0,
            rating: currentContentScore >= 9 ? 'Exceptional'
              : currentContentScore >= 7.5 ? 'Excellent'
              : currentContentScore >= 6 ? 'Very Good'
              : currentContentScore >= 4.5 ? 'Good'
              : currentContentScore >= 3 ? 'Fair'
              : 'Poor',
          },
          engagement: {
            rate: Number(currentEngagementRate.toFixed(2)),
            changePercent: Number(engagementChange.toFixed(1)),
            isPositive: engagementChange >= 0,
          },
          topPerformer,
        },
      });
    } catch (error: any) {
      console.error('[PERFORMANCE-OVERVIEW] Error:', error?.message);
      res.status(500).json({ success: false, error: 'Failed to load performance overview' });
    }
  }
);

const HistoricalQuery = z.object({
  period: z.enum(['day', 'week', 'month']).optional().default('week'),
  days: z.coerce.number().int().positive().max(365).optional().default(30),
  workspaceId: z.string().min(1),
});

router.get('/historical',
  requireAuth,
  validateWorkspaceAccess({ source: 'query' }),
  analyticsHistoryGuard(),
  async (req, res) => {
    try {
      const { period, days } = HistoricalQuery.parse(req.query);
      const workspaceId = (req as any).workspaceId;

      if (!workspaceId) {
        return res.status(400).json({ success: false, error: 'Workspace ID is required' });
      }

      // Post-auth cache: serve a recent result instantly (short TTL). Fail-open.
      try {
        const { CachingSystem } = await import('../../performance/caching-system');
        const cached = await CachingSystem.getHistoricalAnalytics(workspaceId, period, days);
        if (cached) {
          return res.json(cached);
        }
      } catch { /* miss/unavailable → compute */ }

      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const { analyticsService } = await import('../../services');
      const analytics = await analyticsService.getAnalyticsByDateRange({
        workspaceId,
        startDate,
        endDate
      });

      console.log(`[HISTORICAL] workspaceId=${workspaceId} period=${period} days=${days} records=${analytics.length}`);
      analytics.forEach((a: any) => console.log(`  -> date=${new Date(a.date).toISOString().split('T')[0]} followers=${a.followers} platform=${a.platform}`));

      const historicalData = analytics.map((a: any) => ({
        date: a.date || a.createdAt,
        platform: a.platform,
        accountId: a.accountId,
        followers: a.followers || 0,
        likes: a.likes || 0,
        comments: a.comments || 0,
        shares: a.shares || 0,
        reach: a.reach || 0,
        reachDay: a.reachDay || 0,
        reachWeek: a.reachWeek || 0,
        reachDays28: a.reachDays28 || 0,
        viewsDay: a.viewsDay || 0,
        viewsWeek: a.viewsWeek || 0,
        viewsDays28: a.viewsDays28 || 0,
        engagement: a.engagement || 0,
        views: a.views || 0,
        posts: a.posts || 0,
        metrics: {
          posts: a.customMetrics?.posts || 0,
          contentScore: { score: a.engagement || 5 }
        }
      }));

      console.log(`[HISTORICAL] Returning ${historicalData.length} records. First follower=${historicalData[0]?.followers}, first posts=${historicalData[0]?.posts}`);
      const payload = { success: true, data: historicalData };
      // Write-through cache (short TTL ~60s) so reloads/navigation are instant.
      try {
        const { CachingSystem } = await import('../../performance/caching-system');
        void CachingSystem.set(`historical:${workspaceId}:${period}:${days}`, payload, 60, [`workspace:${workspaceId}`, 'historical']);
      } catch { /* non-fatal */ }
      res.json(payload);
    } catch (error: any) {
      const safeError = error instanceof Error ?
        { message: error.message, stack: error.stack, name: error.name } :
        { message: String(error) };

      console.error('[HISTORICAL] Error fetching historical analytics:', JSON.stringify(safeError));
      res.status(500).json({ success: false, error: safeError.message || 'Failed to fetch historical analytics' });
    }
  }
);

const GenerateInsightSchema = z.object({
  metricsData: z.any().optional(),
  period: z.enum(['day', 'week', 'month']).optional().default('month'),
  forceRefresh: z.boolean().optional()
});

// Shared helper: load the full AI configuration (workspace overrides user prefs).
async function loadAiPreferences(userId: string, workspaceId: string): Promise<any> {
  const { storage } = await import('../../storage');
  const { resolveNiche } = await import('../../services/niche.util');
  let preferences: any = {};
  try {
    const userObj = await storage.getUser(userId);
    if (userObj && userObj.preferences) preferences = { ...userObj.preferences };
    // Guarantee the niche is present so growth recommendations and the AI
    // banner are tailored to the user's niche, even for older accounts.
    if (userObj && !preferences.contentNiche) {
      const niche = resolveNiche(userObj);
      if (niche) preferences.contentNiche = niche;
    }
    const workspace = await storage.getWorkspace(workspaceId);
    if (workspace && workspace.aiConfiguration) {
      preferences = { ...preferences, ...workspace.aiConfiguration };
    }
  } catch (e) {
    console.warn('[ANALYTICS] Failed to load AI preferences, using defaults');
  }
  return preferences;
}

// AI Analytics Insights — requires Pro plan + 2 AI credits (aiAnalyticsInsight cost).
router.post('/workspace/:workspaceId/generate-insight',
  requireAuth,
  validateWorkspaceAccess({ source: 'params' }),
  ...performanceBannerGuards,
  validateRequest({ params: WorkspaceIdParams, body: GenerateInsightSchema }),
  async (req: any, res) => {
    try {
      const { workspaceId } = req.params;
      const { metricsData, period, forceRefresh } = req.body;
      const userId = req.user.id;
      const selectedPeriod = period || metricsData?.period || 'month';

      const preferences = await loadAiPreferences(userId, workspaceId);

      const { getSharedRedisConnection } = await import('../../lib/redis');
      const {
        isInsightsQueueAvailable, InsightsQueueManager, insightsCacheKey, insightsLastKnownKey,
        insightsLockKey, insightsCooldownKey
      } = await import('../../queues/insightsQueue');

      // ---- Redis-first: serve the worker-produced result without touching MongoDB ----
      if (isInsightsQueueAvailable()) {
        const redis = getSharedRedisConnection();
        const cacheKey = insightsCacheKey('banner', workspaceId, selectedPeriod);

        let cached: any = null;
        if (!forceRefresh) {
          try {
            const raw = await redis.get(cacheKey);
            if (raw) cached = JSON.parse(raw);
          } catch { /* fall through */ }
        }

        // Cache hit → serve immediately. Staleness is handled by:
        //   1. syncAccount() deletes these keys whenever Instagram data changes.
        //   2. 4h TTL in the worker so banners auto-expire.
        //   3. _sv in /api/dashboard/analytics busts the client sessionStorage on restart.
        // No per-request signature check needed — keeps this path pure Redis (fast).
        if (cached?.banner) {
          // Backfill the persistent key for hot-cache entries created before
          // last-known preservation was deployed.
          void redis.set(
            insightsLastKnownKey('banner', workspaceId, selectedPeriod),
            JSON.stringify(cached),
            'NX',
          ).catch(() => undefined);
          return res.json({
            success: true,
            status: 'ready',
            insight: cached.banner.tip || cached.banner.headline,
            banner: cached.banner,
            generatedAt: cached.generatedAt
          });
        }

        // Keep a persistent known-good banner separate from the invalidatable
        // hot cache. It is returned while a refresh runs and after the monthly
        // automatic-generation cap prevents further provider calls.
        let lastKnown: any = null;
        try {
          const raw = await redis.get(insightsLastKnownKey('banner', workspaceId, selectedPeriod));
          if (raw) lastKnown = JSON.parse(raw);
        } catch { /* fall through */ }

        // If a recent generation failed (e.g. AI quota), respect the cooldown:
        // tell the client to stop polling instead of re-enqueuing and hammering
        // the AI provider. A forced refresh ignores the cooldown.
        if (!forceRefresh) {
          try {
            const cd = await redis.get(insightsCooldownKey('banner', workspaceId, selectedPeriod));
            if (cd) {
              if (lastKnown?.banner) {
                return res.json({
                  success: true, status: 'ready', stale: true,
                  insight: lastKnown.banner.tip || lastKnown.banner.headline,
                  banner: lastKnown.banner, generatedAt: lastKnown.generatedAt,
                });
              }
              return res.json({ success: true, status: 'error', error: 'temporarily_unavailable' });
            }
          } catch { /* ignore */ }
        }

        // Cache miss (or forced refresh): enqueue a worker job, guarded by a
        // short-lived lock so concurrent requests don't enqueue duplicates and
        // hammer MongoDB.
        const lockKey = insightsLockKey('banner', workspaceId, selectedPeriod);
        let shouldEnqueue = true;
        try {
          // SET NX EX: only the first caller within the lock window enqueues.
          const acquired = await redis.set(lockKey, '1', 'EX', 60, 'NX');
          shouldEnqueue = acquired === 'OK' || forceRefresh === true;
        } catch { /* enqueue anyway on lock error */ }

        if (shouldEnqueue) {
          await InsightsQueueManager.enqueue({
            kind: 'banner', workspaceId, userId, preferences,
            period: selectedPeriod, clientMetrics: metricsData || null
          });
        }

        // Stale-while-revalidate: never blank a previously generated card.
        // If the worker is capped it exits before calling the provider and this
        // last-known response remains visible without another charge.
        if (lastKnown?.banner) {
          return res.json({
            success: true, status: 'ready', stale: true, refreshing: shouldEnqueue,
            insight: lastKnown.banner.tip || lastKnown.banner.headline,
            banner: lastKnown.banner, generatedAt: lastKnown.generatedAt,
          });
        }

        // LONG-POLL (no websocket): hold this request open and return the moment
        // the worker writes the result to Redis, or status:'pending' after ~20s
        // so the client can re-request. Robust over proxies/CDNs, no persistent
        // connection. Aborts early if the client disconnects.
        {
          let clientGone = false;
          req.on('close', () => { clientGone = true; });
          const deadline = Date.now() + 20000;
          while (Date.now() < deadline && !clientGone) {
            await new Promise((r) => setTimeout(r, 400));
            try {
              const raw = await redis.get(cacheKey);
              if (raw) {
                const c = JSON.parse(raw);
                if (c?.banner) {
                  return res.json({
                    success: true, status: 'ready',
                    insight: c.banner.tip || c.banner.headline,
                    banner: c.banner, generatedAt: c.generatedAt
                  });
                }
              }
              const cd = await redis.get(insightsCooldownKey('banner', workspaceId, selectedPeriod));
              if (cd) return res.json({ success: true, status: 'error', error: 'temporarily_unavailable' });
            } catch { /* keep waiting */ }
          }
        }
        return res.json({ success: true, status: 'pending' });
      }

      // ---- Fallback (no Redis/queue): generate inline so the feature still works ----
      const { buildBannerData } = await import('../../services/InsightsDataService');
      const { data } = await buildBannerData(workspaceId, selectedPeriod, metricsData || null);
      const { aiServiceManager } = await import('../../services/AIServiceManager');
      const { aiCreditMeteringService } = await import('../../features/subscription/services/AICreditMeteringService');
      const { result: insight, settlement } = await aiCreditMeteringService.runMetered(
        'performanceBanner',
        'growth.insight',
        { userId, workspaceId, automatic: true },
        async () => {
          const insight = await aiServiceManager.generateAnalyticsInsight(data, preferences);
          if (!insight || (!String(insight.headline || '').trim() && !String(insight.tip || '').trim())) {
            throw new Error('AI returned no usable Performance Overview insight');
          }
          return insight;
        },
      );

      res.json({
        success: true,
        status: 'ready',
        insight: insight.tip || insight.headline,
        banner: insight,
        creditsUsed: settlement.charged,
      });
    } catch (error: any) {
      console.error('[ANALYTICS INSIGHT] Error generating insight:', error);
      res.status(error?.statusCode === 402 ? 402 : 500).json({
        success: false,
        error: error?.message || 'Failed to generate insight',
      });
    }
  }
);

/**
 * POST /workspace/:workspaceId/growth-recommendations
 *
 * Flagship growth feature. Assembles the COMPLETE real dataset for the account
 * (profile, follower trend, engagement/reach metrics, post-level performance,
 * posting frequency/cadence, best active times, audience demographics) and asks
 * the AI — using the user's full AI Configuration — for prioritised, specific,
 * data-grounded recommendations to grow reach and engagement.
 */
// AI Recommendations — Basic on Free, standard on Creator, advanced growth analysis on Pro+.
router.post('/workspace/:workspaceId/growth-recommendations',
  requireAuth,
  validateWorkspaceAccess({ source: 'params' }),
  ...growthRecommendationGuards,
  validateRequest({ params: WorkspaceIdParams, body: z.object({ forceRefresh: z.boolean().optional() }).optional() }),
  async (req: any, res) => {
    try {
      const { workspaceId } = req.params;
      const userId = req.user.id;
      const forceRefresh = req.body?.forceRefresh === true;

      const preferences = await loadAiPreferences(userId, workspaceId);
      const { aiCreditMeteringService } = await import('../../features/subscription/services/AICreditMeteringService');
      const recommendationPlan = await aiCreditMeteringService.getPlan(userId);
      // Free gets two concise, high-impact recommendations; Creator gets
      // three; Pro+ receives the full five-item growth analysis.
      preferences.recommendationLimit = recommendationPlan === 'free'
        ? 2
        : recommendationPlan === 'creator' ? 3 : 5;

      const { getSharedRedisConnection } = await import('../../lib/redis');
      const {
        isInsightsQueueAvailable, InsightsQueueManager, insightsCacheKey, insightsLastKnownKey,
        insightsLockKey, insightsCooldownKey
      } = await import('../../queues/insightsQueue');

      // ---- Redis-first: serve the worker-produced result without touching MongoDB ----
      if (isInsightsQueueAvailable()) {
        const redis = getSharedRedisConnection();
        const cacheKey = insightsCacheKey('recommendations', workspaceId);

        let cached: any = null;
        if (!forceRefresh) {
          try {
            const raw = await redis.get(cacheKey);
            if (raw) cached = JSON.parse(raw);
          } catch { /* fall through */ }
        }

        // Cache hit → serve immediately. Same staleness strategy as banner:
        // syncAccount() busts the key, 4h TTL is the backstop.
        if (cached?.recommendations?.length) {
          void redis.set(
            insightsLastKnownKey('recommendations', workspaceId),
            JSON.stringify(cached),
            'NX',
          ).catch(() => undefined);
          return res.json({ success: true, status: 'ready', recommendations: cached.recommendations, cached: true, generatedAt: cached.generatedAt });
        }

        let lastKnown: any = null;
        try {
          const raw = await redis.get(insightsLastKnownKey('recommendations', workspaceId));
          if (raw) lastKnown = JSON.parse(raw);
        } catch { /* fall through */ }

        // Respect the failure cooldown so a failed generation (e.g. AI quota)
        // doesn't get re-enqueued on every poll and burn through quota.
        if (!forceRefresh) {
          try {
            const cd = await redis.get(insightsCooldownKey('recommendations', workspaceId));
            if (cd) {
              if (lastKnown?.recommendations?.length) {
                return res.json({
                  success: true, status: 'ready', recommendations: lastKnown.recommendations,
                  cached: true, stale: true, generatedAt: lastKnown.generatedAt,
                });
              }
              return res.json({ success: true, status: 'error', error: 'temporarily_unavailable', recommendations: [] });
            }
          } catch { /* ignore */ }
        }

        // Cache miss / forced refresh: enqueue a worker job behind a short lock
        // so concurrent requests don't enqueue duplicates and overload MongoDB.
        const lockKey = insightsLockKey('recommendations', workspaceId);
        let shouldEnqueue = true;
        try {
          const acquired = await redis.set(lockKey, '1', 'EX', 120, 'NX');
          shouldEnqueue = acquired === 'OK' || forceRefresh === true;
        } catch { /* enqueue anyway on lock error */ }

        if (shouldEnqueue) {
          await InsightsQueueManager.enqueue({ kind: 'recommendations', workspaceId, userId, preferences });
        }

        if (lastKnown?.recommendations?.length) {
          return res.json({
            success: true, status: 'ready', recommendations: lastKnown.recommendations,
            cached: true, stale: true, refreshing: shouldEnqueue,
            generatedAt: lastKnown.generatedAt,
          });
        }

        // LONG-POLL (no websocket): hold open until the worker result lands in
        // Redis, or return status:'pending' after ~20s for the client to retry.
        {
          let clientGone = false;
          req.on('close', () => { clientGone = true; });
          const deadline = Date.now() + 20000;
          while (Date.now() < deadline && !clientGone) {
            await new Promise((r) => setTimeout(r, 400));
            try {
              const raw = await redis.get(cacheKey);
              if (raw) {
                const c = JSON.parse(raw);
                if (c?.recommendations?.length) {
                  return res.json({ success: true, status: 'ready', recommendations: c.recommendations, cached: true, generatedAt: c.generatedAt });
                }
              }
              const cd = await redis.get(insightsCooldownKey('recommendations', workspaceId));
              if (cd) return res.json({ success: true, status: 'error', error: 'temporarily_unavailable', recommendations: [] });
            } catch { /* keep waiting */ }
          }
        }
        return res.json({ success: true, status: 'pending', recommendations: [] });
      }

      // ---- Fallback (no Redis/queue): generate inline so the feature still works ----
      const { buildRecommendationsData } = await import('../../services/InsightsDataService');
      const { data } = await buildRecommendationsData(workspaceId);
      const { aiServiceManager } = await import('../../services/AIServiceManager');
      const { result: recommendations, settlement } = await aiCreditMeteringService.runMetered(
        'aiGrowthRecommendation',
        'growth.recommendations',
        { userId, workspaceId, automatic: true },
        async () => {
          const recommendations = await aiServiceManager.generateGrowthRecommendations(data, preferences);
          if (!Array.isArray(recommendations) || recommendations.length === 0) {
            throw new Error('AI returned no usable recommendations');
          }
          return recommendations;
        },
      );

      res.json({
        success: true,
        status: 'ready',
        recommendations,
        creditsUsed: settlement.charged,
        cached: false,
        generatedAt: new Date(),
      });
    } catch (error: any) {
      console.error('[GROWTH RECS] Error generating recommendations:', error?.message);
      res.status(error?.statusCode === 402 ? 402 : 500).json({
        success: false,
        error: error?.message || 'Failed to generate recommendations',
      });
    }
  }
);

router.get('/:analyticsId',
  requireAuth,
  validateRequest({ params: AnalyticsIdParams }),
  analyticsController.getAnalytics
);

export default router;
