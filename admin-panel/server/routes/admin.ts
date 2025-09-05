import { Router } from 'express';
import { AdminController } from '../controllers/adminController';
import { validateAdminCreate, validateAdminUpdate, validatePagination, validateSearch } from '../middleware/validation';
import { requireRole, requirePermission, auditLog } from '../middleware/auth';

const router = Router();

// Get all admins
router.get('/', 
  requirePermission('view_admins'),
  validatePagination,
  validateSearch,
  auditLog('admin_list', 'admin', 'low'),
  AdminController.getAdmins
);

// Get admin by ID
router.get('/:id',
  requirePermission('view_admins'),
  auditLog('admin_view', 'admin', 'low'),
  AdminController.getAdminById
);

// Create new admin
router.post('/',
  requireRole(['superadmin']),
  requirePermission('create_admins'),
  validateAdminCreate,
  auditLog('admin_create', 'admin', 'high'),
  AdminController.createAdmin
);

// Update admin
router.put('/:id',
  requirePermission('edit_admins'),
  validateAdminUpdate,
  auditLog('admin_update', 'admin', 'high'),
  AdminController.updateAdmin
);

// Delete admin
router.delete('/:id',
  requireRole(['superadmin']),
  requirePermission('delete_admins'),
  auditLog('admin_delete', 'admin', 'critical'),
  AdminController.deleteAdmin
);

// Toggle admin status
router.patch('/:id/status',
  requirePermission('edit_admins'),
  auditLog('admin_status_toggle', 'admin', 'high'),
  AdminController.toggleAdminStatus
);

// Admin invites
router.get('/invites/list',
  requirePermission('view_admin_invites'),
  validatePagination,
  auditLog('admin_invites_list', 'admin_invite', 'low'),
  AdminController.getAdminInvites
);

router.post('/invites/:id/approve',
  requirePermission('approve_admin_invites'),
  auditLog('admin_invite_approve', 'admin_invite', 'high'),
  AdminController.approveInvite
);

router.post('/invites/:id/reject',
  requirePermission('approve_admin_invites'),
  auditLog('admin_invite_reject', 'admin_invite', 'medium'),
  AdminController.rejectInvite
);

export default router;
