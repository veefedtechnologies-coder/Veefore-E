import express from 'express';
import { BulkOperationsController } from '../controllers/bulkOperationsController';
import { authenticate, authorize } from '../middleware/auth';

const router = express.Router();

// Execute bulk operation
router.post('/execute',
  authenticate,
  authorize(['superadmin', 'admin']),
  BulkOperationsController.executeBulkOperation
);

// Get bulk operation preview
router.get('/preview',
  authenticate,
  authorize(['superadmin', 'admin']),
  BulkOperationsController.getBulkOperationPreview
);

// Export data
router.post('/export',
  authenticate,
  authorize(['superadmin', 'admin']),
  BulkOperationsController.exportData
);

// Get bulk operation templates
router.get('/templates',
  authenticate,
  authorize(['superadmin', 'admin']),
  BulkOperationsController.getBulkOperationTemplates
);

export default router;
