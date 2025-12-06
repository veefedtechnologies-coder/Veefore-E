import { Router } from 'express';
import { analyticsController } from '../../controllers';
import { requireAuth } from '../../middleware/require-auth';
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

router.get('/:analyticsId', 
  requireAuth,
  validateRequest({ params: AnalyticsIdParams }),
  analyticsController.getAnalytics
);

export default router;
