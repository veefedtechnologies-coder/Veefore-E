import express from 'express';
import { MaintenanceBannerController } from '../controllers/maintenanceBannerController';
import { authenticate, authorize } from '../middleware/auth';

const router = express.Router();

// Get all maintenance banners
router.get('/',
  authenticate,
  authorize(['superadmin', 'admin']),
  MaintenanceBannerController.getBanners
);

// Get active banners for display
router.get('/active',
  MaintenanceBannerController.getActiveBanners
);

// Get banner by ID
router.get('/:id',
  authenticate,
  authorize(['superadmin', 'admin']),
  MaintenanceBannerController.getBannerById
);

// Create maintenance banner
router.post('/',
  authenticate,
  authorize(['superadmin', 'admin']),
  MaintenanceBannerController.createBanner
);

// Update maintenance banner
router.put('/:id',
  authenticate,
  authorize(['superadmin', 'admin']),
  MaintenanceBannerController.updateBanner
);

// Delete maintenance banner
router.delete('/:id',
  authenticate,
  authorize(['superadmin']),
  MaintenanceBannerController.deleteBanner
);

// Toggle banner status
router.patch('/:id/toggle',
  authenticate,
  authorize(['superadmin', 'admin']),
  MaintenanceBannerController.toggleBannerStatus
);

// Record banner interaction
router.post('/:id/interaction',
  MaintenanceBannerController.recordInteraction
);

// Get banner statistics
router.get('/:id/stats',
  authenticate,
  authorize(['superadmin', 'admin']),
  MaintenanceBannerController.getBannerStats
);

// Bulk operations
router.post('/bulk',
  authenticate,
  authorize(['superadmin', 'admin']),
  MaintenanceBannerController.bulkUpdateBanners
);

export default router;
