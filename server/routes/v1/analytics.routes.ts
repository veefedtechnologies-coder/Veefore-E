import { Router } from 'express';
import { analyticsController } from '../../controllers';
import { requireAuth } from '../../middleware/require-auth';
import { validateWorkspaceAccess } from '../../middleware/workspace-validation';
import { validateRequest } from '../../middleware/validation';
import { z } from 'zod';

const router = Router();

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

const HistoricalQuery = z.object({
  period: z.enum(['day', 'week', 'month']).optional().default('week'),
  days: z.coerce.number().int().positive().max(365).optional().default(30),
  workspaceId: z.string().min(1),
});

router.get('/historical',
  requireAuth,
  validateWorkspaceAccess({ source: 'query' }),
  async (req, res) => {
    try {
      const { period, days } = HistoricalQuery.parse(req.query);
      const workspaceId = (req as any).workspaceId;

      if (!workspaceId) {
        return res.status(400).json({ success: false, error: 'Workspace ID is required' });
      }

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
      res.json({ success: true, data: historicalData });
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
  metricsData: z.any()
});

router.post('/workspace/:workspaceId/generate-insight',
  requireAuth,
  validateWorkspaceAccess({ source: 'params' }),
  validateRequest({ params: WorkspaceIdParams, body: GenerateInsightSchema }),
  async (req: any, res) => {
    try {
      const { workspaceId } = req.params;
      const { metricsData } = req.body;
      const userId = req.user.id;

      const { storage } = await import('../../storage');
      let preferences: any = {};
      try {
        const userObj = await storage.getUser(userId);
        if (userObj && userObj.preferences) preferences = { ...userObj.preferences };
        
        const workspace = await storage.getWorkspace(workspaceId);
        if (workspace && workspace.aiConfiguration) {
          preferences = { ...preferences, ...workspace.aiConfiguration };
        }
      } catch (e) {
        console.warn('Failed to load preferences');
      }

      const { aiServiceManager } = await import('../../services/AIServiceManager');
      const insight = await aiServiceManager.generateAnalyticsInsight(metricsData, preferences);

      res.json({ success: true, insight });
    } catch (error: any) {
      console.error('[ANALYTICS INSIGHT] Error generating insight:', error);
      res.status(500).json({ success: false, error: 'Failed to generate insight' });
    }
  }
);

router.get('/:analyticsId',
  requireAuth,
  validateRequest({ params: AnalyticsIdParams }),
  analyticsController.getAnalytics
);

export default router;
