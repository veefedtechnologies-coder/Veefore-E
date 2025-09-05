import { Router } from 'express';
import { SupportTicketController } from '../controllers/supportTicketController';
import { authenticate, authorize } from '../middleware/auth';
import { validatePagination, validateSearch } from '../middleware/validation';

const router = Router();

// Public routes for email integration
router.post('/email', SupportTicketController.createTicketFromEmail);

// Apply authentication to admin routes
router.use(authenticate);

// Get all tickets with filtering
router.get('/',
  authorize(['superadmin', 'admin', 'support']),
  validatePagination,
  validateSearch,
  SupportTicketController.getTickets
);

// Get ticket statistics
router.get('/stats',
  authorize(['superadmin', 'admin', 'support']),
  SupportTicketController.getTicketAnalytics
);

// Get ticket by ID
router.get('/:id',
  authorize(['superadmin', 'admin', 'support']),
  SupportTicketController.getTicketById
);

// Update ticket
router.put('/:id',
  authorize(['superadmin', 'admin', 'support']),
  SupportTicketController.updateTicket
);

// Reply to ticket
router.post('/:id/reply',
  authorize(['superadmin', 'admin', 'support']),
  SupportTicketController.replyToTicket
);

// Escalate ticket
router.post('/:id/escalate',
  authorize(['superadmin', 'admin', 'support']),
  SupportTicketController.escalateTicket
);

// Get AI suggestions
router.get('/:id/ai-suggestions',
  authorize(['superadmin', 'admin', 'support']),
  SupportTicketController.getAISuggestions
);

// Bulk operations
router.post('/bulk',
  authorize(['superadmin', 'admin', 'support']),
  SupportTicketController.bulkUpdateTickets
);

export default router;
