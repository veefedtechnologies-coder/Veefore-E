import { Request, Response } from 'express';
import Role from '../models/Role';
import Admin from '../models/Admin';
import AuditLog from '../models/AuditLog';
import { AuthRequest } from '../middleware/auth';

// Get all roles
export const getAllRoles = async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 10, search, team, level, isActive } = req.query;
    
    const query: any = {};
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (team) {
      query.team = team;
    }
    
    if (level) {
      query.level = parseInt(level as string);
    }
    
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    const roles = await Role.find(query)
      .populate('createdBy', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit as string) * 1)
      .skip((parseInt(page as string) - 1) * parseInt(limit as string));

    const total = await Role.countDocuments(query);

    res.json({
      success: true,
      data: {
        roles,
        pagination: {
          current: parseInt(page as string),
          pages: Math.ceil(total / parseInt(limit as string)),
          total
        }
      }
    });
  } catch (error) {
    console.error('Get all roles error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch roles'
    });
  }
};

// Get role by ID
export const getRoleById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    const role = await Role.findById(id)
      .populate('createdBy', 'firstName lastName email');
    
    if (!role) {
      return res.status(404).json({
        success: false,
        message: 'Role not found'
      });
    }

    res.json({
      success: true,
      data: role
    });
  } catch (error) {
    console.error('Get role by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch role'
    });
  }
};

// Create new role
export const createRole = async (req: AuthRequest, res: Response) => {
  try {
    const {
      name,
      description,
      permissions,
      level,
      team,
      teamRestrictions,
      moduleAccess,
      customPermissions,
      approvalRequired,
      maxLevelOverride,
      escalationRules,
      dataAccess,
      timeRestrictions,
      ipRestrictions
    } = req.body;

    // Check if role name already exists
    const existingRole = await Role.findOne({ name });
    if (existingRole) {
      return res.status(400).json({
        success: false,
        message: 'Role name already exists'
      });
    }

    // Validate permissions
    const validPermissions = [
      'users.read', 'users.write', 'users.delete',
      'refunds.read', 'refunds.write', 'refunds.delete', 'refunds.approve',
      'subscriptions.read', 'subscriptions.write', 'subscriptions.delete',
      'tickets.read', 'tickets.write', 'tickets.delete', 'tickets.assign',
      'analytics.read', 'analytics.export',
      'settings.read', 'settings.write',
      'roles.read', 'roles.write', 'roles.delete',
      'admins.read', 'admins.write', 'admins.delete',
      'audit.read', 'audit.export',
      'notifications.read', 'notifications.write', 'notifications.delete',
      'coupons.read', 'coupons.write', 'coupons.delete',
      'webhooks.read', 'webhooks.write', 'webhooks.delete',
      'ai.read', 'ai.write', 'ai.moderate'
    ];

    const invalidPermissions = permissions.filter((p: string) => !validPermissions.includes(p));
    if (invalidPermissions.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Invalid permissions: ${invalidPermissions.join(', ')}`
      });
    }

    const role = new Role({
      name,
      description,
      permissions,
      level,
      team,
      teamRestrictions,
      moduleAccess,
      customPermissions,
      approvalRequired,
      maxLevelOverride,
      escalationRules,
      dataAccess,
      timeRestrictions,
      ipRestrictions,
      createdBy: req.admin._id
    });

    await role.save();

    // Log the action
    await AuditLog.create({
      adminId: req.admin._id,
      adminEmail: req.admin.email,
      action: 'role_created',
      resource: 'Role',
      resourceId: role._id,
      details: {
        roleName: name,
        permissions: permissions.length,
        level
      },
      ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown',
      riskLevel: 'medium'
    });

    res.status(201).json({
      success: true,
      message: 'Role created successfully',
      data: role
    });
  } catch (error) {
    console.error('Create role error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create role'
    });
  }
};

// Update role
export const updateRole = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const role = await Role.findById(id);
    if (!role) {
      return res.status(404).json({
        success: false,
        message: 'Role not found'
      });
    }

    // Prevent modification of system roles
    if (role.isSystem) {
      return res.status(400).json({
        success: false,
        message: 'Cannot modify system roles'
      });
    }

    // Check if updating name and it already exists
    if (updateData.name && updateData.name !== role.name) {
      const existingRole = await Role.findOne({ name: updateData.name });
      if (existingRole) {
        return res.status(400).json({
          success: false,
          message: 'Role name already exists'
        });
      }
    }

    // Validate permissions if provided
    if (updateData.permissions) {
      const validPermissions = [
        'users.read', 'users.write', 'users.delete',
        'refunds.read', 'refunds.write', 'refunds.delete', 'refunds.approve',
        'subscriptions.read', 'subscriptions.write', 'subscriptions.delete',
        'tickets.read', 'tickets.write', 'tickets.delete', 'tickets.assign',
        'analytics.read', 'analytics.export',
        'settings.read', 'settings.write',
        'roles.read', 'roles.write', 'roles.delete',
        'admins.read', 'admins.write', 'admins.delete',
        'audit.read', 'audit.export',
        'notifications.read', 'notifications.write', 'notifications.delete',
        'coupons.read', 'coupons.write', 'coupons.delete',
        'webhooks.read', 'webhooks.write', 'webhooks.delete',
        'ai.read', 'ai.write', 'ai.moderate'
      ];

      const invalidPermissions = updateData.permissions.filter((p: string) => !validPermissions.includes(p));
      if (invalidPermissions.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Invalid permissions: ${invalidPermissions.join(', ')}`
        });
      }
    }

    const updatedRole = await Role.findByIdAndUpdate(
      id,
      { ...updateData, lastModifiedBy: req.admin._id },
      { new: true, runValidators: true }
    );

    // Log the action
    await AuditLog.create({
      adminId: req.admin._id,
      adminEmail: req.admin.email,
      action: 'role_updated',
      resource: 'Role',
      resourceId: role._id,
      details: {
        changes: updateData,
        roleName: role.name
      },
      ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown',
      riskLevel: 'medium'
    });

    res.json({
      success: true,
      message: 'Role updated successfully',
      data: updatedRole
    });
  } catch (error) {
    console.error('Update role error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update role'
    });
  }
};

// Delete role
export const deleteRole = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const role = await Role.findById(id);
    if (!role) {
      return res.status(404).json({
        success: false,
        message: 'Role not found'
      });
    }

    // Prevent deletion of system roles
    if (role.isSystem) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete system roles'
      });
    }

    // Check if role is in use
    const adminsUsingRole = await Admin.countDocuments({ role: role.name });
    if (adminsUsingRole > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete role. ${adminsUsingRole} admin(s) are using this role.`
      });
    }

    await Role.findByIdAndDelete(id);

    // Log the action
    await AuditLog.create({
      adminId: req.admin._id,
      adminEmail: req.admin.email,
      action: 'role_deleted',
      resource: 'Role',
      resourceId: role._id,
      details: {
        roleName: role.name
      },
      ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown',
      riskLevel: 'high'
    });

    res.json({
      success: true,
      message: 'Role deleted successfully'
    });
  } catch (error) {
    console.error('Delete role error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete role'
    });
  }
};

// Get role permissions
export const getRolePermissions = async (req: AuthRequest, res: Response) => {
  try {
    const permissions = {
      users: {
        read: 'users.read',
        write: 'users.write',
        delete: 'users.delete'
      },
      refunds: {
        read: 'refunds.read',
        write: 'refunds.write',
        delete: 'refunds.delete',
        approve: 'refunds.approve'
      },
      subscriptions: {
        read: 'subscriptions.read',
        write: 'subscriptions.write',
        delete: 'subscriptions.delete'
      },
      tickets: {
        read: 'tickets.read',
        write: 'tickets.write',
        delete: 'tickets.delete',
        assign: 'tickets.assign'
      },
      analytics: {
        read: 'analytics.read',
        export: 'analytics.export'
      },
      settings: {
        read: 'settings.read',
        write: 'settings.write'
      },
      roles: {
        read: 'roles.read',
        write: 'roles.write',
        delete: 'roles.delete'
      },
      admins: {
        read: 'admins.read',
        write: 'admins.write',
        delete: 'admins.delete'
      },
      audit: {
        read: 'audit.read',
        export: 'audit.export'
      },
      notifications: {
        read: 'notifications.read',
        write: 'notifications.write',
        delete: 'notifications.delete'
      },
      coupons: {
        read: 'coupons.read',
        write: 'coupons.write',
        delete: 'coupons.delete'
      },
      webhooks: {
        read: 'webhooks.read',
        write: 'webhooks.write',
        delete: 'webhooks.delete'
      },
      ai: {
        read: 'ai.read',
        write: 'ai.write',
        moderate: 'ai.moderate'
      }
    };

    res.json({
      success: true,
      data: permissions
    });
  } catch (error) {
    console.error('Get role permissions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch role permissions'
    });
  }
};

// Clone role
export const cloneRole = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    const originalRole = await Role.findById(id);
    if (!originalRole) {
      return res.status(404).json({
        success: false,
        message: 'Role not found'
      });
    }

    // Check if new role name already exists
    const existingRole = await Role.findOne({ name });
    if (existingRole) {
      return res.status(400).json({
        success: false,
        message: 'Role name already exists'
      });
    }

    const clonedRole = new Role({
      name,
      description: description || `${originalRole.description} (Copy)`,
      permissions: originalRole.permissions,
      level: originalRole.level,
      team: originalRole.team,
      teamRestrictions: originalRole.teamRestrictions,
      moduleAccess: originalRole.moduleAccess,
      customPermissions: originalRole.customPermissions,
      approvalRequired: originalRole.approvalRequired,
      maxLevelOverride: originalRole.maxLevelOverride,
      escalationRules: originalRole.escalationRules,
      dataAccess: originalRole.dataAccess,
      timeRestrictions: originalRole.timeRestrictions,
      ipRestrictions: originalRole.ipRestrictions,
      createdBy: req.admin._id
    });

    await clonedRole.save();

    // Log the action
    await AuditLog.create({
      adminId: req.admin._id,
      adminEmail: req.admin.email,
      action: 'role_cloned',
      resource: 'Role',
      resourceId: clonedRole._id,
      details: {
        originalRoleId: originalRole._id,
        originalRoleName: originalRole.name,
        newRoleName: name
      },
      ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown',
      riskLevel: 'low'
    });

    res.status(201).json({
      success: true,
      message: 'Role cloned successfully',
      data: clonedRole
    });
  } catch (error) {
    console.error('Clone role error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clone role'
    });
  }
};

// Get role statistics
export const getRoleStatistics = async (req: AuthRequest, res: Response) => {
  try {
    const totalRoles = await Role.countDocuments();
    const activeRoles = await Role.countDocuments({ isActive: true });
    const systemRoles = await Role.countDocuments({ isSystem: true });
    
    const rolesByTeam = await Role.aggregate([
      { $group: { _id: '$team', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    const rolesByLevel = await Role.aggregate([
      { $group: { _id: '$level', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    const adminsByRole = await Admin.aggregate([
      { $group: { _id: '$role', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    res.json({
      success: true,
      data: {
        totalRoles,
        activeRoles,
        systemRoles,
        rolesByTeam,
        rolesByLevel,
        adminsByRole
      }
    });
  } catch (error) {
    console.error('Get role statistics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch role statistics'
    });
  }
};
