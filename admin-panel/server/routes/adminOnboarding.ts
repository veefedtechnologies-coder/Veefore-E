import express from 'express';
import {
  sendAdminInvitation,
  getInvitationByToken,
  acceptInvitation,
  getAllInvitations,
  approveInvitation,
  rejectInvitation,
  resendInvitation,
  getInvitationStatistics
} from '../controllers/adminOnboardingController';
import { rbac, auditLog } from '../middleware/auth';

const router = express.Router();

// Send admin invitation (Super Admin only)
router.post('/invite',
  rbac({ roles: ['superadmin'], permissions: ['admins.write'] }),
  auditLog('admin_invitation_sent', 'AdminInvite', 'medium'),
  sendAdminInvitation
);

// Get invitation by token (Public - for accepting invitations)
router.get('/invitation/:token', getInvitationByToken);

// Accept invitation (Public - for accepting invitations)
router.post('/invitation/:token/accept', acceptInvitation);

// Get all invitations (Admin with permission)
router.get('/invitations',
  rbac({ roles: ['superadmin', 'admin'], permissions: ['admins.read'] }),
  getAllInvitations
);

// Approve invitation (Super Admin only)
router.post('/invitations/:id/approve',
  rbac({ roles: ['superadmin'], permissions: ['admins.write'] }),
  auditLog('admin_invitation_approved', 'AdminInvite', 'medium'),
  approveInvitation
);

// Reject invitation (Super Admin only)
router.post('/invitations/:id/reject',
  rbac({ roles: ['superadmin'], permissions: ['admins.write'] }),
  auditLog('admin_invitation_rejected', 'AdminInvite', 'medium'),
  rejectInvitation
);

// Resend invitation (Super Admin only)
router.post('/invitations/:id/resend',
  rbac({ roles: ['superadmin'], permissions: ['admins.write'] }),
  auditLog('admin_invitation_resent', 'AdminInvite', 'low'),
  resendInvitation
);

// Get invitation statistics (Admin with permission)
router.get('/invitations/statistics',
  rbac({ roles: ['superadmin', 'admin'], permissions: ['admins.read'] }),
  getInvitationStatistics
);

export default router;
