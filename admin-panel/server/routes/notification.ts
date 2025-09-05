import { Router } from 'express';
import { NotificationController } from '../controllers/notificationController';
import { authenticate, authorize } from '../middleware/auth';
import { validatePagination, validateSearch } from '../middleware/validation';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

// Get all notifications with filtering
router.get('/',
  authorize(['superadmin', 'admin', 'marketing']),
  validatePagination,
  validateSearch,
  NotificationController.getNotifications
);

// Get notification statistics
router.get('/stats',
  authorize(['superadmin', 'admin', 'marketing']),
  NotificationController.getNotificationAnalytics
);

// Get notification by ID
router.get('/:id',
  authorize(['superadmin', 'admin', 'marketing']),
  NotificationController.getNotificationById
);

// Create notification
router.post('/',
  authorize(['superadmin', 'admin', 'marketing']),
  NotificationController.createNotification
);

// Update notification
router.put('/:id',
  authorize(['superadmin', 'admin', 'marketing']),
  NotificationController.updateNotification
);

// Send notification
router.post('/:id/send',
  authorize(['superadmin', 'admin', 'marketing']),
  NotificationController.sendNotification
);

// Cancel notification
router.post('/:id/cancel',
  authorize(['superadmin', 'admin', 'marketing']),
  NotificationController.cancelNotification
);

// Delete notification
router.delete('/:id',
  authorize(['superadmin', 'admin', 'marketing']),
  NotificationController.deleteNotification
);

// Bulk operations
router.post('/bulk',
  authorize(['superadmin', 'admin', 'marketing']),
  NotificationController.bulkUpdateNotifications
);

export default router;
