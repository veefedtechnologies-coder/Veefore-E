import express from 'express';
import { SessionManagementController } from '../controllers/sessionManagementController';
import { authenticate, authorize } from '../middleware/auth';

const router = express.Router();

// Get admin sessions
router.get('/admin/:adminId',
  authenticate,
  authorize(['superadmin', 'admin']),
  SessionManagementController.getAdminSessions
);

// Get my sessions
router.get('/my-sessions',
  authenticate,
  SessionManagementController.getMySessions
);

// Get session details
router.get('/:sessionToken',
  authenticate,
  authorize(['superadmin', 'admin']),
  SessionManagementController.getSessionDetails
);

// Terminate session
router.delete('/:sessionToken',
  authenticate,
  authorize(['superadmin', 'admin']),
  SessionManagementController.terminateSession
);

// Terminate all sessions for admin
router.delete('/admin/:adminId/all',
  authenticate,
  authorize(['superadmin', 'admin']),
  SessionManagementController.terminateAllSessions
);

// Terminate my sessions
router.delete('/my-sessions/all',
  authenticate,
  SessionManagementController.terminateMySessions
);

// Terminate sessions by criteria
router.post('/terminate-by-criteria',
  authenticate,
  authorize(['superadmin', 'admin']),
  SessionManagementController.terminateSessionsByCriteria
);

// Get session statistics
router.get('/stats/overview',
  authenticate,
  authorize(['superadmin', 'admin']),
  SessionManagementController.getSessionStats
);

// Update session activity
router.post('/activity',
  authenticate,
  SessionManagementController.updateSessionActivity
);

// Cleanup expired sessions
router.post('/cleanup',
  authenticate,
  authorize(['superadmin']),
  SessionManagementController.cleanupExpiredSessions
);

export default router;
