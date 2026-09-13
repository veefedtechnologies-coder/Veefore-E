import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { CouponController } from '../controllers/couponController';
import { authenticate, authorize } from '../middleware/adminAuth';
import { validatePagination, validateSearch } from '../middleware/validation';

const router = Router();

/**
 * Public coupon validation is intentionally unauthenticated so the checkout UI
 * can validate a code before payment. It is read-only and only ever matches
 * `isPublic: true` coupons, so it cannot redeem or leak private promotions.
 *
 * It IS, however, an oracle that confirms whether a given code exists — without
 * a limit an attacker could brute-force the coupon namespace to discover valid
 * discounts. Cap it tightly per IP.
 */
const couponTestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'development' ? 200 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many coupon validation attempts. Please try again later.',
  },
});

/** Reject malformed bodies before they reach the controller. */
function validateCouponTestBody(
  req: import('express').Request,
  res: import('express').Response,
  next: import('express').NextFunction
) {
  const { code, orderValue } = req.body ?? {};
  if (typeof code !== 'string' || code.trim().length === 0 || code.length > 64) {
    return res.status(400).json({
      success: false,
      message: 'A valid coupon code is required',
    });
  }
  if (orderValue !== undefined && (typeof orderValue !== 'number' || !Number.isFinite(orderValue) || orderValue < 0)) {
    return res.status(400).json({
      success: false,
      message: 'orderValue must be a non-negative number',
    });
  }
  return next();
}

// Public routes for frontend
router.post(
  '/test',
  couponTestLimiter,
  validateCouponTestBody,
  CouponController.testCoupon
);

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