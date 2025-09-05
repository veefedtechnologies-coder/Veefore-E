import express from 'express';
import { WebhookController } from '../controllers/webhookController';
import { authenticate, authorize } from '../middleware/auth';

const router = express.Router();

// Get all webhooks
router.get('/',
  authenticate,
  authorize(['superadmin', 'admin']),
  WebhookController.getWebhooks
);

// Get webhook by ID
router.get('/:id',
  authenticate,
  authorize(['superadmin', 'admin']),
  WebhookController.getWebhookById
);

// Create webhook
router.post('/',
  authenticate,
  authorize(['superadmin', 'admin']),
  WebhookController.createWebhook
);

// Update webhook
router.put('/:id',
  authenticate,
  authorize(['superadmin', 'admin']),
  WebhookController.updateWebhook
);

// Delete webhook
router.delete('/:id',
  authenticate,
  authorize(['superadmin']),
  WebhookController.deleteWebhook
);

// Test webhook
router.post('/:id/test',
  authenticate,
  authorize(['superadmin', 'admin']),
  WebhookController.testWebhook
);

// Get webhook deliveries
router.get('/:id/deliveries',
  authenticate,
  authorize(['superadmin', 'admin']),
  WebhookController.getWebhookDeliveries
);

// Get webhook statistics
router.get('/:id/stats',
  authenticate,
  authorize(['superadmin', 'admin']),
  WebhookController.getWebhookStats
);

// Toggle webhook status
router.patch('/:id/toggle',
  authenticate,
  authorize(['superadmin', 'admin']),
  WebhookController.toggleWebhookStatus
);

// Retry failed delivery
router.post('/deliveries/:deliveryId/retry',
  authenticate,
  authorize(['superadmin', 'admin']),
  WebhookController.retryDelivery
);

export default router;
