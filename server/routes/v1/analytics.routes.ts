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
  validateRequest({ params: WorkspaceIdParams }),
  analyticsController.getByWorkspace
);

router.get('/workspace/:workspaceId/platform', 
  requireAuth,
  validateRequest({ params: WorkspaceIdParams }),
  analyticsController.getByPlatform
);

router.get('/workspace/:workspaceId/date-range', 
  requireAuth,
  validateRequest({ params: WorkspaceIdParams }),
  analyticsController.getDateRange
);

router.get('/workspace/:workspaceId/performance-summary', 
  requireAuth,
  validateRequest({ params: WorkspaceIdParams }),
  analyticsController.getPerformanceSummary
);

router.get('/workspace/:workspaceId/daily', 
  requireAuth,
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
      
      const historicalData = analytics.map((a: any) => ({
        date: a.date || a.createdAt,
        followers: a.followers || 0,
        likes: a.likes || 0,
        comments: a.comments || 0,
        shares: a.shares || 0,
        reach: a.reach || 0,
        engagement: a.engagement || 0,
        views: a.views || 0,
        metrics: {
          posts: a.customMetrics?.posts || 0,
          contentScore: { score: a.engagement || 5 }
        }
      }));
      
      res.json({ success: true, data: historicalData });
    } catch (error: any) {
      console.error('[HISTORICAL] Error fetching historical analytics:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to fetch historical analytics' });
    }
  }
);

router.get('/:analyticsId', 
  requireAuth,
  validateRequest({ params: AnalyticsIdParams }),
  analyticsController.getAnalytics
);

export default router;
