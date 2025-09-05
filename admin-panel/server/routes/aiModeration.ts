import express from 'express';
import { AIModerationController } from '../controllers/aiModerationController';
import { authenticate, authorize } from '../middleware/auth';
import { validatePagination, validateSearch } from '../middleware/validation';

const router = express.Router();

// Get all AI compliance records with filtering
router.get('/',
  authenticate,
  authorize(['superadmin', 'admin', 'moderator']),
  validatePagination,
  validateSearch,
  AIModerationController.getComplianceRecords
);

// Get AI compliance statistics
router.get('/stats',
  authenticate,
  authorize(['superadmin', 'admin', 'moderator']),
  AIModerationController.getComplianceStats
);

// Get compliance trends
router.get('/trends',
  authenticate,
  authorize(['superadmin', 'admin', 'moderator']),
  AIModerationController.getComplianceTrends
);

// Get compliance record by ID
router.get('/:id',
  authenticate,
  authorize(['superadmin', 'admin', 'moderator']),
  AIModerationController.getComplianceRecordById
);

// Update compliance record action
router.put('/:id/action',
  authenticate,
  authorize(['superadmin', 'admin', 'moderator']),
  AIModerationController.updateComplianceAction
);

// Review compliance record
router.put('/:id/review',
  authenticate,
  authorize(['superadmin', 'admin', 'moderator']),
  AIModerationController.reviewComplianceRecord
);

// Bulk update compliance records
router.post('/bulk',
  authenticate,
  authorize(['superadmin', 'admin']),
  AIModerationController.bulkUpdateCompliance
);

// Export compliance data
router.get('/export/data',
  authenticate,
  authorize(['superadmin', 'admin']),
  AIModerationController.exportComplianceData
);

export default router;
