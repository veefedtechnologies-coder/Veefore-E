import express from 'express';
import { 
  PERMISSIONS, 
  ROLE_PERMISSION_CONSTRAINTS, 
  getPermissionById, 
  getPermissionsByCategory, 
  getPermissionsByLevel, 
  getRoleConstraints, 
  validatePermissionAssignment, 
  getAutoGrantedPermissions, 
  getAvailablePermissions, 
  getPermissionCategories, 
  getPermissionsByRiskLevel 
} from '../utils/permissions';
import { rbac } from '../middleware/auth';

const router = express.Router();

// Get all permissions
router.get('/permissions',
  rbac({ roles: ['superadmin', 'admin'], permissions: ['admins.read'] }),
  (req, res) => {
    try {
      res.json({
        success: true,
        data: {
          permissions: PERMISSIONS,
          categories: getPermissionCategories(),
          totalCount: PERMISSIONS.length
        }
      });
    } catch (error) {
      console.error('Get permissions error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch permissions'
      });
    }
  }
);

// Get permissions by category
router.get('/permissions/category/:category',
  rbac({ roles: ['superadmin', 'admin'], permissions: ['admins.read'] }),
  (req, res) => {
    try {
      const { category } = req.params;
      const permissions = getPermissionsByCategory(category);
      
      res.json({
        success: true,
        data: {
          permissions,
          category,
          count: permissions.length
        }
      });
    } catch (error) {
      console.error('Get permissions by category error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch permissions by category'
      });
    }
  }
);

// Get permissions by level
router.get('/permissions/level/:level',
  rbac({ roles: ['superadmin', 'admin'], permissions: ['admins.read'] }),
  (req, res) => {
    try {
      const level = parseInt(req.params.level);
      const permissions = getPermissionsByLevel(level);
      
      res.json({
        success: true,
        data: {
          permissions,
          level,
          count: permissions.length
        }
      });
    } catch (error) {
      console.error('Get permissions by level error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch permissions by level'
      });
    }
  }
);

// Get permissions by risk level
router.get('/permissions/risk/:riskLevel',
  rbac({ roles: ['superadmin', 'admin'], permissions: ['admins.read'] }),
  (req, res) => {
    try {
      const { riskLevel } = req.params;
      const permissions = getPermissionsByRiskLevel(riskLevel);
      
      res.json({
        success: true,
        data: {
          permissions,
          riskLevel,
          count: permissions.length
        }
      });
    } catch (error) {
      console.error('Get permissions by risk level error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch permissions by risk level'
      });
    }
  }
);

// Get role constraints
router.get('/roles/:role/constraints',
  rbac({ roles: ['superadmin', 'admin'], permissions: ['admins.read'] }),
  (req, res) => {
    try {
      const { role } = req.params;
      const constraints = getRoleConstraints(role);
      
      if (!constraints) {
        return res.status(404).json({
          success: false,
          message: 'Role not found'
        });
      }
      
      res.json({
        success: true,
        data: constraints
      });
    } catch (error) {
      console.error('Get role constraints error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch role constraints'
      });
    }
  }
);

// Get available permissions for a role
router.get('/roles/:role/permissions',
  rbac({ roles: ['superadmin', 'admin'], permissions: ['admins.read'] }),
  (req, res) => {
    try {
      const { role } = req.params;
      const permissions = getAvailablePermissions(role);
      
      res.json({
        success: true,
        data: {
          permissions,
          role,
          count: permissions.length
        }
      });
    } catch (error) {
      console.error('Get available permissions error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch available permissions'
      });
    }
  }
);

// Get auto-granted permissions for a role
router.get('/roles/:role/auto-granted',
  rbac({ roles: ['superadmin', 'admin'], permissions: ['admins.read'] }),
  (req, res) => {
    try {
      const { role } = req.params;
      const permissions = getAutoGrantedPermissions(role);
      
      res.json({
        success: true,
        data: {
          permissions,
          role,
          count: permissions.length
        }
      });
    } catch (error) {
      console.error('Get auto-granted permissions error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch auto-granted permissions'
      });
    }
  }
);

// Validate permission assignment
router.post('/validate-assignment',
  rbac({ roles: ['superadmin', 'admin'], permissions: ['admins.write'] }),
  (req, res) => {
    try {
      const { role, permissions } = req.body;
      
      if (!role || !Array.isArray(permissions)) {
        return res.status(400).json({
          success: false,
          message: 'Role and permissions array are required'
        });
      }
      
      const validation = validatePermissionAssignment(role, permissions);
      
      res.json({
        success: true,
        data: validation
      });
    } catch (error) {
      console.error('Validate permission assignment error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to validate permission assignment'
      });
    }
  }
);

// Get all role constraints
router.get('/roles/constraints',
  rbac({ roles: ['superadmin', 'admin'], permissions: ['admins.read'] }),
  (req, res) => {
    try {
      res.json({
        success: true,
        data: {
          constraints: ROLE_PERMISSION_CONSTRAINTS,
          roles: ROLE_PERMISSION_CONSTRAINTS.map(c => c.role)
        }
      });
    } catch (error) {
      console.error('Get all role constraints error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch role constraints'
      });
    }
  }
);

// Get permission by ID
router.get('/permissions/:id',
  rbac({ roles: ['superadmin', 'admin'], permissions: ['admins.read'] }),
  (req, res) => {
    try {
      const { id } = req.params;
      const permission = getPermissionById(id);
      
      if (!permission) {
        return res.status(404).json({
          success: false,
          message: 'Permission not found'
        });
      }
      
      res.json({
        success: true,
        data: permission
      });
    } catch (error) {
      console.error('Get permission by ID error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch permission'
      });
    }
  }
);

export default router;
