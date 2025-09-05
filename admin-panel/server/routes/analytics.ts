import express from 'express';
import { authenticate, authorize } from '../middleware/auth';
import {
  getAnalyticsOverview,
  getTrafficSources,
  getDeviceAnalytics,
  getGeographicAnalytics,
  getConversionFunnel,
  getRealTimeAnalytics,
  getSalesAnalytics,
  exportAnalytics
} from '../controllers/analyticsController';

const router = express.Router();

// All analytics routes require authentication
router.use(authenticate);

// Analytics overview
router.get('/overview', getAnalyticsOverview);

// Traffic sources
router.get('/traffic', getTrafficSources);

// Device analytics
router.get('/devices', getDeviceAnalytics);

// Geographic analytics
router.get('/geographic', getGeographicAnalytics);

// Conversion funnel
router.get('/funnel', getConversionFunnel);

// Real-time analytics
router.get('/realtime', getRealTimeAnalytics);

// Sales analytics
router.get('/sales', getSalesAnalytics);

// Export analytics data (requires admin or manager role)
router.post('/export', 
  authorize(['admin', 'manager']),
  exportAnalytics
);

export default router;