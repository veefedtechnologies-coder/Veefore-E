import { Router } from 'express';
import { SubscriptionController } from '../controllers/subscriptionController';
import { authenticate, authorize } from '../middleware/auth';
import { validatePagination, validateSearch } from '../middleware/validation';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

// Get all subscriptions with filtering
router.get('/',
  authorize(['superadmin', 'admin', 'billing']),
  validatePagination,
  validateSearch,
  SubscriptionController.getSubscriptions
);

// Get subscription statistics
router.get('/stats',
  authorize(['superadmin', 'admin', 'billing']),
  SubscriptionController.getSubscriptionAnalytics
);

// Get region-based pricing
router.get('/pricing/:planId',
  authorize(['superadmin', 'admin', 'billing']),
  SubscriptionController.getRegionPricing
);

// Get subscription by ID
router.get('/:id',
  authorize(['superadmin', 'admin', 'billing']),
  SubscriptionController.getSubscriptionById
);

// Create subscription
router.post('/',
  authorize(['superadmin', 'admin', 'billing']),
  SubscriptionController.createSubscription
);

// Update subscription
router.put('/:id',
  authorize(['superadmin', 'admin', 'billing']),
  SubscriptionController.updateSubscription
);

// Cancel subscription
router.post('/:id/cancel',
  authorize(['superadmin', 'admin', 'billing']),
  SubscriptionController.cancelSubscription
);

// Reactivate subscription
router.post('/:id/reactivate',
  authorize(['superadmin', 'admin', 'billing']),
  SubscriptionController.reactivateSubscription
);

// Apply coupon to subscription
router.post('/:id/coupon',
  authorize(['superadmin', 'admin', 'billing']),
  SubscriptionController.applyCoupon
);

// Bulk operations
router.post('/bulk',
  authorize(['superadmin', 'admin', 'billing']),
  SubscriptionController.bulkUpdateSubscriptions
);

export default router;