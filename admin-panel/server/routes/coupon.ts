import { Router } from 'express';
import { CouponController } from '../controllers/couponController';
import { authenticate, authorize } from '../middleware/auth';
import { validatePagination, validateSearch } from '../middleware/validation';

const router = Router();

// Public routes for frontend
router.post('/test', CouponController.testCoupon);

// Apply authentication to admin routes
router.use(authenticate);

// Get all coupons with filtering
router.get('/',
  authorize(['superadmin', 'admin', 'marketing']),
  validatePagination,
  validateSearch,
  CouponController.getCoupons
);

// Get coupon statistics
router.get('/stats',
  authorize(['superadmin', 'admin', 'marketing']),
  CouponController.getCouponAnalytics
);

// Get coupon by ID
router.get('/:id',
  authorize(['superadmin', 'admin', 'marketing']),
  CouponController.getCouponById
);

// Create coupon
router.post('/',
  authorize(['superadmin', 'admin', 'marketing']),
  CouponController.createCoupon
);

// Update coupon
router.put('/:id',
  authorize(['superadmin', 'admin', 'marketing']),
  CouponController.updateCoupon
);

// Activate coupon
router.post('/:id/activate',
  authorize(['superadmin', 'admin', 'marketing']),
  CouponController.activateCoupon
);

// Pause coupon
router.post('/:id/pause',
  authorize(['superadmin', 'admin', 'marketing']),
  CouponController.pauseCoupon
);

// Archive coupon
router.post('/:id/archive',
  authorize(['superadmin', 'admin', 'marketing']),
  CouponController.archiveCoupon
);

// Delete coupon
router.delete('/:id',
  authorize(['superadmin', 'admin', 'marketing']),
  CouponController.deleteCoupon
);

// Generate QR code
router.post('/:id/qr',
  authorize(['superadmin', 'admin', 'marketing']),
  CouponController.generateQRCode
);

// Bulk operations
router.post('/bulk',
  authorize(['superadmin', 'admin', 'marketing']),
  CouponController.bulkUpdateCoupons
);

export default router;