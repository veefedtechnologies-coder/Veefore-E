import { Request, Response } from 'express';
import Admin from '../models/Admin';
import AdminInvite from '../models/AdminInvite';
import Role from '../models/Role';
import AuditLog from '../models/AuditLog';
import { AuthRequest } from '../middleware/auth';
import { validateAdminCreate, validateAdminUpdate, validatePagination, validateSearch } from '../middleware/validation';
import { sendEmail } from '../utils/email';
import { generateRandomPassword } from '../utils/security';

export class AdminController {
  // Get all admins
  static async getAdmins(req: AuthRequest, res: Response) {
    try {
      const {
        page = 1,
        limit = 10,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        q,
        filters
      } = req.query;

      const query: any = {};
      
      // Search functionality
      if (q) {
        query.$or = [
          { firstName: { $regex: q, $options: 'i' } },
          { lastName: { $regex: q, $options: 'i' } },
          { email: { $regex: q, $options: 'i' } }
        ];
      }

      // Apply filters
      if (filters) {
        try {
          const parsedFilters = JSON.parse(filters as string);
          Object.keys(parsedFilters).forEach(key => {
            if (parsedFilters[key] !== null && parsedFilters[key] !== undefined && parsedFilters[key] !== '') {
              query[key] = parsedFilters[key];
            }
          });
        } catch (error) {
          return res.status(400).json({
            success: false,
            message: 'Invalid filters format'
          });
        }
      }

      const sort: any = {};
      sort[sortBy as string] = sortOrder === 'asc' ? 1 : -1;

      const admins = await Admin.find(query)
        .select('-password -twoFactorSecret')
        .sort(sort)
        .limit(Number(limit) * 1)
        .skip((Number(page) - 1) * Number(limit))
        .populate('role', 'name description');

      const total = await Admin.countDocuments(query);

      res.json({
        success: true,
        data: {
          admins,
          pagination: {
            current: Number(page),
            pages: Math.ceil(total / Number(limit)),
            total
          }
        }
      });
    } catch (error) {
      console.error('Get admins error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get admin by ID
  static async getAdminById(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const admin = await Admin.findById(id)
        .select('-password -twoFactorSecret')
        .populate('role', 'name description');

      if (!admin) {
        return res.status(404).json({
          success: false,
          message: 'Admin not found'
        });
      }

      res.json({
        success: true,
        data: { admin }
      });
    } catch (error) {
      console.error('Get admin by ID error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Create new admin
  static async createAdmin(req: AuthRequest, res: Response) {
    try {
      const {
        email,
        firstName,
        lastName,
        role,
        level,
        team,
        permissions,
        sendInvite = true
      } = req.body;

      // Check if admin already exists
      const existingAdmin = await Admin.findOne({ email: email.toLowerCase() });
      if (existingAdmin) {
        return res.status(400).json({
          success: false,
          message: 'Admin with this email already exists'
        });
      }

      // Generate random password
      const password = generateRandomPassword();

      // Create admin
      const admin = new Admin({
        email: email.toLowerCase(),
        password,
        firstName,
        lastName,
        role,
        level,
        team,
        permissions
      });

      await admin.save();

      // Send invitation email if requested
      if (sendInvite) {
        const invite = new AdminInvite({
          email: email.toLowerCase(),
          firstName,
          lastName,
          role,
          level,
          team,
          permissions,
          invitedBy: req.admin._id,
          status: 'pending'
        });

        await invite.save();

        // Send email
        await sendEmail({
          to: email,
          subject: 'Welcome to VeeFore Admin Panel',
          template: 'admin-invite',
          data: {
            firstName,
            lastName,
            email,
            password,
            inviteLink: `${process.env.FRONTEND_URL}/admin/invite/${invite.invitationToken}`,
            expiresAt: invite.expiresAt
          }
        });
      }

      // Log admin creation
      await AuditLog.create({
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        action: 'admin_create',
        resource: 'admin',
        resourceId: admin._id.toString(),
        details: {
          createdAdmin: {
            email: admin.email,
            firstName: admin.firstName,
            lastName: admin.lastName,
            role: admin.role,
            level: admin.level,
            team: admin.team
          },
          sendInvite
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'high',
        isSensitive: true
      });

      res.status(201).json({
        success: true,
        message: 'Admin created successfully',
        data: {
          admin: {
            id: admin._id,
            email: admin.email,
            firstName: admin.firstName,
            lastName: admin.lastName,
            role: admin.role,
            level: admin.level,
            team: admin.team,
            permissions: admin.permissions,
            isActive: admin.isActive,
            createdAt: admin.createdAt
          }
        }
      });
    } catch (error) {
      console.error('Create admin error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Update admin
  static async updateAdmin(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const admin = await Admin.findById(id);
      if (!admin) {
        return res.status(404).json({
          success: false,
          message: 'Admin not found'
        });
      }

      // Store old data for audit
      const oldData = {
        role: admin.role,
        level: admin.level,
        team: admin.team,
        permissions: admin.permissions,
        isActive: admin.isActive
      };

      // Update admin
      Object.keys(updateData).forEach(key => {
        if (updateData[key] !== undefined) {
          admin[key] = updateData[key];
        }
      });

      await admin.save();

      // Log admin update
      await AuditLog.create({
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        action: 'admin_update',
        resource: 'admin',
        resourceId: admin._id.toString(),
        details: {
          oldData,
          newData: {
            role: admin.role,
            level: admin.level,
            team: admin.team,
            permissions: admin.permissions,
            isActive: admin.isActive
          }
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'high',
        isSensitive: true
      });

      res.json({
        success: true,
        message: 'Admin updated successfully',
        data: {
          admin: {
            id: admin._id,
            email: admin.email,
            firstName: admin.firstName,
            lastName: admin.lastName,
            role: admin.role,
            level: admin.level,
            team: admin.team,
            permissions: admin.permissions,
            isActive: admin.isActive,
            updatedAt: admin.updatedAt
          }
        }
      });
    } catch (error) {
      console.error('Update admin error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Delete admin
  static async deleteAdmin(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const admin = await Admin.findById(id);
      if (!admin) {
        return res.status(404).json({
          success: false,
          message: 'Admin not found'
        });
      }

      // Prevent self-deletion
      if (admin._id.toString() === req.admin._id.toString()) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete your own account'
        });
      }

      // Prevent deletion of superadmin
      if (admin.role === 'superadmin') {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete superadmin account'
        });
      }

      await Admin.findByIdAndDelete(id);

      // Log admin deletion
      await AuditLog.create({
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        action: 'admin_delete',
        resource: 'admin',
        resourceId: admin._id.toString(),
        details: {
          deletedAdmin: {
            email: admin.email,
            firstName: admin.firstName,
            lastName: admin.lastName,
            role: admin.role
          }
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'critical',
        isSensitive: true
      });

      res.json({
        success: true,
        message: 'Admin deleted successfully'
      });
    } catch (error) {
      console.error('Delete admin error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Toggle admin status
  static async toggleAdminStatus(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { isActive } = req.body;

      const admin = await Admin.findById(id);
      if (!admin) {
        return res.status(404).json({
          success: false,
          message: 'Admin not found'
        });
      }

      // Prevent self-deactivation
      if (admin._id.toString() === req.admin._id.toString()) {
        return res.status(400).json({
          success: false,
          message: 'Cannot deactivate your own account'
        });
      }

      admin.isActive = isActive;
      await admin.save();

      // Log status change
      await AuditLog.create({
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        action: 'admin_update',
        resource: 'admin',
        resourceId: admin._id.toString(),
        details: {
          field: 'isActive',
          oldValue: !isActive,
          newValue: isActive
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'high',
        isSensitive: true
      });

      res.json({
        success: true,
        message: `Admin ${isActive ? 'activated' : 'deactivated'} successfully`
      });
    } catch (error) {
      console.error('Toggle admin status error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get admin invites
  static async getAdminInvites(req: AuthRequest, res: Response) {
    try {
      const {
        page = 1,
        limit = 10,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        status
      } = req.query;

      const query: any = {};
      if (status) {
        query.status = status;
      }

      const sort: any = {};
      sort[sortBy as string] = sortOrder === 'asc' ? 1 : -1;

      const invites = await AdminInvite.find(query)
        .populate('invitedBy', 'firstName lastName email')
        .populate('approvedBy', 'firstName lastName email')
        .populate('rejectedBy', 'firstName lastName email')
        .sort(sort)
        .limit(Number(limit) * 1)
        .skip((Number(page) - 1) * Number(limit));

      const total = await AdminInvite.countDocuments(query);

      res.json({
        success: true,
        data: {
          invites,
          pagination: {
            current: Number(page),
            pages: Math.ceil(total / Number(limit)),
            total
          }
        }
      });
    } catch (error) {
      console.error('Get admin invites error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Approve admin invite
  static async approveInvite(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const invite = await AdminInvite.findById(id);
      if (!invite) {
        return res.status(404).json({
          success: false,
          message: 'Invite not found'
        });
      }

      if (invite.status !== 'pending') {
        return res.status(400).json({
          success: false,
          message: 'Invite is not pending approval'
        });
      }

      if (invite.isExpired) {
        invite.status = 'expired';
        await invite.save();
        return res.status(400).json({
          success: false,
          message: 'Invite has expired'
        });
      }

      invite.status = 'approved';
      invite.approvedBy = req.admin._id;
      invite.approvedAt = new Date();
      await invite.save();

      // Send approval email
      await sendEmail({
        to: invite.email,
        subject: 'Admin Invitation Approved - VeeFore',
        template: 'admin-invite-approved',
        data: {
          firstName: invite.firstName,
          lastName: invite.lastName,
          loginLink: `${process.env.FRONTEND_URL}/admin/login`
        }
      });

      // Log approval
      await AuditLog.create({
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        action: 'admin_invite_approve',
        resource: 'admin_invite',
        resourceId: invite._id.toString(),
        details: {
          inviteEmail: invite.email,
          inviteRole: invite.role
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'high',
        isSensitive: true
      });

      res.json({
        success: true,
        message: 'Invite approved successfully'
      });
    } catch (error) {
      console.error('Approve invite error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Reject admin invite
  static async rejectInvite(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const invite = await AdminInvite.findById(id);
      if (!invite) {
        return res.status(404).json({
          success: false,
          message: 'Invite not found'
        });
      }

      if (invite.status !== 'pending') {
        return res.status(400).json({
          success: false,
          message: 'Invite is not pending approval'
        });
      }

      invite.status = 'rejected';
      invite.rejectedBy = req.admin._id;
      invite.rejectedAt = new Date();
      invite.rejectionReason = reason;
      await invite.save();

      // Log rejection
      await AuditLog.create({
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        action: 'admin_invite_reject',
        resource: 'admin_invite',
        resourceId: invite._id.toString(),
        details: {
          inviteEmail: invite.email,
          inviteRole: invite.role,
          reason
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'medium'
      });

      res.json({
        success: true,
        message: 'Invite rejected successfully'
      });
    } catch (error) {
      console.error('Reject invite error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
}
