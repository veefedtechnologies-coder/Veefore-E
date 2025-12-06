import { Router } from 'express';
import { analyticsController } from '../../controllers';

const router = Router();

router.get('/platform/:platform', analyticsController.getByPlatform);
router.get('/date-range', analyticsController.getDateRange);
router.get('/performance-summary', analyticsController.getPerformanceSummary);
router.get('/daily', analyticsController.getDailyMetrics);
router.get('/:analyticsId', analyticsController.getAnalytics);
router.get('/', analyticsController.getByWorkspace);

export default router;
