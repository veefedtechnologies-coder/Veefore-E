import { Router, Request, Response } from 'express';
import { ApiMonitorService } from '../services/api-monitor';
import { requireAdminAuth, requireRole } from '../admin-auth';

const router = Router();

// Apply the review mode blocker to all admin routes
router.use((req: Request, res: Response, next) => {
  if (process.env.META_PHASE_1_REVIEW_MODE === 'true') {
    return res.status(403).json({ success: false, error: 'Feature disabled during Meta Phase 1 Review' });
  }
  next();
});

/**
 * GET /api/admin/monitoring/meta-usage
 * Returns the current stats of the API monitor
 */
router.get('/meta-usage', requireAdminAuth, requireRole(['superadmin', 'admin']), (req: Request, res: Response) => {
  try {
    // Verified admin access using requireAdminAuth and requireRole
    const report = ApiMonitorService.getInstance().getReport();
    res.json({
      success: true,
      report
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
