import { Router } from 'express';
import { PopupController } from '../controllers/popupController';
import { authenticate, authorize } from '../middleware/auth';
import { validatePagination, validateSearch } from '../middleware/validation';

const router = Router();

// Public routes for frontend
router.get('/active', PopupController.getActivePopups);
router.post('/track', PopupController.trackPopupInteraction);

// Apply authentication to admin routes
router.use(authenticate);

// Get all popups with filtering
router.get('/',
  authorize(['superadmin', 'admin', 'marketing']),
  validatePagination,
  validateSearch,
  PopupController.getPopups
);

// Get popup statistics
router.get('/stats',
  authorize(['superadmin', 'admin', 'marketing']),
  PopupController.getPopupAnalytics
);

// Get popup by ID
router.get('/:id',
  authorize(['superadmin', 'admin', 'marketing']),
  PopupController.getPopupById
);

// Create popup
router.post('/',
  authorize(['superadmin', 'admin', 'marketing']),
  PopupController.createPopup
);

// Update popup
router.put('/:id',
  authorize(['superadmin', 'admin', 'marketing']),
  PopupController.updatePopup
);

// Activate popup
router.post('/:id/activate',
  authorize(['superadmin', 'admin', 'marketing']),
  PopupController.activatePopup
);

// Pause popup
router.post('/:id/pause',
  authorize(['superadmin', 'admin', 'marketing']),
  PopupController.pausePopup
);

// Archive popup
router.post('/:id/archive',
  authorize(['superadmin', 'admin', 'marketing']),
  PopupController.archivePopup
);

// Delete popup
router.delete('/:id',
  authorize(['superadmin', 'admin', 'marketing']),
  PopupController.deletePopup
);

// Bulk operations
router.post('/bulk',
  authorize(['superadmin', 'admin', 'marketing']),
  PopupController.bulkUpdatePopups
);

export default router;
