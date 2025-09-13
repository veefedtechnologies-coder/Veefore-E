import express from 'express';
import Admin from '../models/Admin';
import { rbac } from '../middleware/auth';
import { auditLog } from '../middleware/auditLog';
import CredentialGenerator from '../utils/credentialGenerator';
import { AuthRequest } from '../middleware/auth';

const router = express.Router();

// Get all admins with detailed information
router.get('/admin',
  rbac({ roles: ['superadmin', 'admin'], permissions: ['admins.read'] }),
  async (req: AuthRequest, res) => {
    try {
      const { page = 1, limit = 50, search, role, team, status } = req.query;
      
      const query: any = {};
      
      if (search) {
        query.$or = [
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { username: { $regex: search, $options: 'i' } }
        ];
      }
      
      if (role) {
        query.role = role;
      }
      
      if (team) {
        query.team = team;
      }
      
      if (status) {
        if (status === 'active') {
          query.isActive = true;
        } else if (status === 'suspended') {
          query.isActive = false;
        } else if (status === 'unverified') {
          query.isEmailVerified = false;
        }
      }
      
      const admins = await Admin.find(query)
        .select('-password')
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);
      
      const total = await Admin.countDocuments(query);
      
      res.json({
        success: true,
        data: admins,
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          pages: Math.ceil(total / parseInt(limit as string))
        }
      });
    } catch (error) {
      console.error('Get admins error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch admins'
      });
    }
  }
);

// Get admin by ID
router.get('/admin/:id',
  rbac({ roles: ['superadmin', 'admin'], permissions: ['admins.read.detailed'] }),
  async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      
      const admin = await Admin.findById(id).select('-password');
      
      if (!admin) {
        return res.status(404).json({
          success: false,
          message: 'Admin not found'
        });
      }
      
      res.json({
        success: true,
        data: admin
      });
    } catch (error) {
      console.error('Get admin error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch admin'
      });
    }
  }
);

// Update admin
router.put('/admin/:id',
  rbac({ roles: ['superadmin', 'admin'], permissions: ['admins.edit'] }),
  auditLog('admin_updated'),
  async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const updateData = req.body;
      
      // Remove sensitive fields that shouldn't be updated via this endpoint
      delete updateData.password;
      delete updateData.email;
      delete updateData.username;
      delete updateData._id;
      delete updateData.createdAt;
      
      const admin = await Admin.findByIdAndUpdate(
        id,
        { ...updateData, updatedAt: new Date() },
        { new: true, runValidators: true }
      ).select('-password');
      
      if (!admin) {
        return res.status(404).json({
          success: false,
          message: 'Admin not found'
        });
      }
      
      res.json({
        success: true,
        message: 'Admin updated successfully',
        data: admin
      });
    } catch (error) {
      console.error('Update admin error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update admin'
      });
    }
  }
);

// Delete admin
router.delete('/admin/:id',
  rbac({ roles: ['superadmin'], permissions: ['admins.delete'] }),
  auditLog('admin_deleted'),
  async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      
      // Prevent deleting self
      if (id === req.admin._id.toString()) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete your own account'
        });
      }
      
      const admin = await Admin.findByIdAndDelete(id);
      
      if (!admin) {
        return res.status(404).json({
          success: false,
          message: 'Admin not found'
        });
      }
      
      res.json({
        success: true,
        message: 'Admin deleted successfully'
      });
    } catch (error) {
      console.error('Delete admin error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete admin'
      });
    }
  }
);

// Suspend/Activate admin
router.patch('/admin/:id/status',
  rbac({ roles: ['superadmin', 'admin'], permissions: ['admins.edit'] }),
  auditLog('admin_status_changed'),
  async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const { isActive } = req.body;
      
      // Prevent suspending self
      if (id === req.admin._id.toString()) {
        return res.status(400).json({
          success: false,
          message: 'Cannot change your own account status'
        });
      }
      
      const admin = await Admin.findByIdAndUpdate(
        id,
        { isActive, updatedAt: new Date() },
        { new: true, runValidators: true }
      ).select('-password');
      
      if (!admin) {
        return res.status(404).json({
          success: false,
          message: 'Admin not found'
        });
      }
      
      res.json({
        success: true,
        message: `Admin ${isActive ? 'activated' : 'suspended'} successfully`,
        data: admin
      });
    } catch (error) {
      console.error('Update admin status error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update admin status'
      });
    }
  }
);

// Generate new credentials for admin
router.post('/admin/:id/generate-credentials',
  rbac({ roles: ['superadmin', 'admin'], permissions: ['admins.read.detailed'] }),
  auditLog('admin_credentials_generated'),
  async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      
      const admin = await Admin.findById(id);
      
      if (!admin) {
        return res.status(404).json({
          success: false,
          message: 'Admin not found'
        });
      }
      
      // Generate new credentials
      const credentials = CredentialGenerator.generateCredentials(
        admin.email,
        admin.firstName,
        admin.lastName
      );
      
      // Hash the new password
      const hashedPassword = await CredentialGenerator.hashPassword(credentials.password);
      
      // Update admin with new credentials
      await Admin.findByIdAndUpdate(id, {
        username: credentials.username,
        password: hashedPassword,
        updatedAt: new Date()
      });
      
      res.json({
        success: true,
        message: 'New credentials generated successfully',
        data: credentials
      });
    } catch (error) {
      console.error('Generate credentials error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate credentials'
      });
    }
  }
);

// Reset admin password
router.post('/admin/:id/reset-password',
  rbac({ roles: ['superadmin', 'admin'], permissions: ['auth.password.reset'] }),
  auditLog('admin_password_reset'),
  async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const { newPassword } = req.body;
      
      if (!newPassword) {
        return res.status(400).json({
          success: false,
          message: 'New password is required'
        });
      }
      
      const admin = await Admin.findById(id);
      
      if (!admin) {
        return res.status(404).json({
          success: false,
          message: 'Admin not found'
        });
      }
      
      // Hash the new password
      const hashedPassword = await CredentialGenerator.hashPassword(newPassword);
      
      // Update admin password
      await Admin.findByIdAndUpdate(id, {
        password: hashedPassword,
        updatedAt: new Date()
      });
      
      res.json({
        success: true,
        message: 'Password reset successfully'
      });
    } catch (error) {
      console.error('Reset password error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to reset password'
      });
    }
  }
);

// Get admin activity logs
router.get('/admin/:id/activity',
  rbac({ roles: ['superadmin', 'admin'], permissions: ['admins.read.detailed'] }),
  async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const { page = 1, limit = 20 } = req.query;
      
      const AuditLog = require('../models/AuditLog');
      
      const logs = await AuditLog.find({ adminId: id })
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);
      
      const total = await AuditLog.countDocuments({ adminId: id });
      
      res.json({
        success: true,
        data: logs,
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          pages: Math.ceil(total / parseInt(limit as string))
        }
      });
    } catch (error) {
      console.error('Get admin activity error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch admin activity'
      });
    }
  }
);

// Get admin statistics
router.get('/admin/stats',
  rbac({ roles: ['superadmin', 'admin'], permissions: ['admins.read'] }),
  async (req: AuthRequest, res) => {
    try {
      const totalAdmins = await Admin.countDocuments();
      const activeAdmins = await Admin.countDocuments({ isActive: true });
      const suspendedAdmins = await Admin.countDocuments({ isActive: false });
      const verifiedAdmins = await Admin.countDocuments({ isEmailVerified: true });
      const twoFactorEnabled = await Admin.countDocuments({ twoFactorEnabled: true });
      
      // Role distribution
      const roleStats = await Admin.aggregate([
        { $group: { _id: '$role', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]);
      
      // Team distribution
      const teamStats = await Admin.aggregate([
        { $group: { _id: '$team', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]);
      
      // Recent activity (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const recentLogins = await Admin.countDocuments({
        lastLoginAt: { $gte: thirtyDaysAgo }
      });
      
      res.json({
        success: true,
        data: {
          total: totalAdmins,
          active: activeAdmins,
          suspended: suspendedAdmins,
          verified: verifiedAdmins,
          twoFactorEnabled,
          recentLogins,
          roleDistribution: roleStats,
          teamDistribution: teamStats
        }
      });
    } catch (error) {
      console.error('Get admin stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch admin statistics'
      });
    }
  }
);

export default router;
