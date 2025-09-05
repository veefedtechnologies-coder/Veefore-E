import { Router } from 'express';
import { RefundController } from '../controllers/refundController';
import { authenticate, authorize } from '../middleware/auth';
import { validatePagination, validateSearch } from '../middleware/validation';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

// Get all refunds with advanced filtering
router.get('/',
  authorize(['superadmin', 'admin', 'billing']),
  validatePagination,
  validateSearch,
  RefundController.getRefunds
);

// Get refund statistics
router.get('/stats',
  authorize(['superadmin', 'admin', 'billing']),
  RefundController.getRefundStats
);

// Get refund by ID
router.get('/:id',
  authorize(['superadmin', 'admin', 'billing']),
  RefundController.getRefundById
);

// Create refund
router.post('/',
  authorize(['superadmin', 'admin', 'billing']),
  RefundController.createRefund
);

// Update refund
router.put('/:id',
  authorize(['superadmin', 'admin', 'billing']),
  RefundController.updateRefund
);

// Approve refund
router.post('/:id/approve',
  authorize(['superadmin', 'admin', 'billing']),
  RefundController.approveRefund
);

// Reject refund
router.post('/:id/reject',
  authorize(['superadmin', 'admin', 'billing']),
  RefundController.rejectRefund
);

// Process refund
router.post('/:id/process',
  authorize(['superadmin', 'admin', 'billing']),
  RefundController.processRefund
);

// Bulk operations
router.post('/bulk',
  authorize(['superadmin', 'admin', 'billing']),
  RefundController.bulkUpdateRefunds
);

export default router;
