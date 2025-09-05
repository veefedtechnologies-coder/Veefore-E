import express from 'express';
import {
  getAllRoles,
  getRoleById,
  createRole,
  updateRole,
  deleteRole,
  getRolePermissions,
  cloneRole,
  getRoleStatistics
} from '../controllers/roleController';
import { rbac, auditLog } from '../middleware/auth';

const router = express.Router();

// Get all roles
router.get('/', 
  rbac({ roles: ['superadmin', 'admin'], permissions: ['roles.read'] }),
  getAllRoles
);

// Get role by ID
router.get('/:id',
  rbac({ roles: ['superadmin', 'admin'], permissions: ['roles.read'] }),
  getRoleById
);

// Create new role
router.post('/',
  rbac({ roles: ['superadmin'], permissions: ['roles.write'] }),
  auditLog('role_created', 'Role', 'medium'),
  createRole
);

// Update role
router.put('/:id',
  rbac({ roles: ['superadmin'], permissions: ['roles.write'] }),
  auditLog('role_updated', 'Role', 'medium'),
  updateRole
);

// Delete role
router.delete('/:id',
  rbac({ roles: ['superadmin'], permissions: ['roles.delete'] }),
  auditLog('role_deleted', 'Role', 'high'),
  deleteRole
);

// Get role permissions
router.get('/permissions/list',
  rbac({ roles: ['superadmin', 'admin'], permissions: ['roles.read'] }),
  getRolePermissions
);

// Clone role
router.post('/:id/clone',
  rbac({ roles: ['superadmin'], permissions: ['roles.write'] }),
  auditLog('role_cloned', 'Role', 'low'),
  cloneRole
);

// Get role statistics
router.get('/stats/overview',
  rbac({ roles: ['superadmin', 'admin'], permissions: ['roles.read'] }),
  getRoleStatistics
);

export default router;
