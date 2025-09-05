import express from 'express';
import { authenticate } from '../middleware/auth';
import {
  getDashboardStats,
  getSalesData,
  getUserActivities,
  getProjectRisk,
  getApplicationSales,
  exportDashboard
} from '../controllers/dashboardController';

const router = express.Router();

// All dashboard routes require authentication
router.use(authenticate);

// Dashboard statistics
router.get('/stats', getDashboardStats);

// Sales analytics data
router.get('/sales', getSalesData);

// User activities feed
router.get('/activities', getUserActivities);

// Project risk assessment
router.get('/risk', getProjectRisk);

// Application sales data
router.get('/applications', getApplicationSales);

// Export dashboard data
router.post('/export', exportDashboard);

export default router;
