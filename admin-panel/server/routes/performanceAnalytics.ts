import express from 'express';
import { PerformanceAnalyticsController } from '../controllers/performanceAnalyticsController';
import { authenticate, authorize } from '../middleware/auth';

const router = express.Router();

// Get real-time system metrics
router.get('/realtime',
  authenticate,
  authorize(['superadmin', 'admin']),
  PerformanceAnalyticsController.getRealTimeMetrics
);

// Get system health status
router.get('/health',
  authenticate,
  authorize(['superadmin', 'admin', 'moderator']),
  PerformanceAnalyticsController.getHealthStatus
);

// Get performance trends
router.get('/trends',
  authenticate,
  authorize(['superadmin', 'admin']),
  PerformanceAnalyticsController.getPerformanceTrends
);

// Get metrics history
router.get('/history',
  authenticate,
  authorize(['superadmin', 'admin']),
  PerformanceAnalyticsController.getMetricsHistory
);

// Get performance summary
router.get('/summary',
  authenticate,
  authorize(['superadmin', 'admin', 'moderator']),
  PerformanceAnalyticsController.getPerformanceSummary
);

// Get database performance metrics
router.get('/database',
  authenticate,
  authorize(['superadmin', 'admin']),
  PerformanceAnalyticsController.getDatabaseMetrics
);

// Get error analytics
router.get('/errors',
  authenticate,
  authorize(['superadmin', 'admin']),
  PerformanceAnalyticsController.getErrorAnalytics
);

// Get business metrics
router.get('/business',
  authenticate,
  authorize(['superadmin', 'admin']),
  PerformanceAnalyticsController.getBusinessMetrics
);

// Toggle monitoring
router.post('/monitoring',
  authenticate,
  authorize(['superadmin']),
  PerformanceAnalyticsController.toggleMonitoring
);

export default router;
