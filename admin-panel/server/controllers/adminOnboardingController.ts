import { Request, Response } from 'express';
import crypto from 'crypto';
import Admin from '../models/Admin';
import AdminInvite from '../models/AdminInvite';
import Role from '../models/Role';
import AuditLog from '../models/AuditLog';
import { EmailService } from '../utils/email';
import { AuthRequest } from '../middleware/auth';

const emailService = new EmailService();

// Send admin invitation
export const sendAdminInvitation = async (req: AuthRequest, res: Response) => {
  try {
    const {
      email,
      firstName,
      lastName,
      role,
      level,
      team,
      permissions,
      expirationHours = 48,
      customMessage
    } = req.body;

    // Validate email domain if required
    const allowedDomains = process.env.ALLOWED_EMAIL_DOMAINS?.split(',') || [];
    if (allowedDomains.length > 0) {
      const emailDomain = email.split('@')[1];
      if (!allowedDomains.includes(emailDomain)) {
        return res.status(400).json({
          success: false,
          message: `Email domain ${emailDomain} is not allowed. Allowed domains: ${allowedDomains.join(', ')}`
        });
      }
    }

    // Check if admin already exists
    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      return res.status(400).json({
        success: false,
        message: 'Admin with this email already exists'
      });
    }

    // Check if there's already a pending invitation
    const existingInvite = await AdminInvite.findOne({ 
      email, 
      status: { $in: ['pending', 'approved'] } 
    });
    if (existingInvite) {
      return res.status(400).json({
        success: false,
        message: 'A pending invitation already exists for this email'
      });
    }

    // Get role details
    const roleDetails = await Role.findOne({ name: role });
    if (!roleDetails) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role specified'
      });
    }

    // Create invitation
    const invitationToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + expirationHours * 60 * 60 * 1000);

    const invite = new AdminInvite({
      email,
      firstName,
      lastName,
      role,
      level,
      team,
      permissions: permissions || roleDetails.permissions,
      invitedBy: req.admin._id,
      invitationToken,
      expiresAt
    });

    await invite.save();

    // Send invitation email
    const invitationLink = `${process.env.FRONTEND_URL}/admin/accept-invitation?token=${invitationToken}`;
    
    const emailTemplate = {
      to: email,
      subject: `Invitation to join VeeFore Admin Panel`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>You're invited to join VeeFore Admin Panel</h2>
          <p>Hello ${firstName},</p>
          <p>You have been invited to join the VeeFore Admin Panel by ${req.admin.firstName} ${req.admin.lastName}.</p>
          
          <div style="background-color: #f5f5f5; padding: 20px; margin: 20px 0; border-radius: 5px;">
            <h3>Invitation Details:</h3>
            <ul>
              <li><strong>Role:</strong> ${role}</li>
              <li><strong>Level:</strong> ${level}</li>
              <li><strong>Team:</strong> ${team}</li>
              <li><strong>Expires:</strong> ${expiresAt.toLocaleDateString()}</li>
            </ul>
          </div>

          ${customMessage ? `<p><strong>Personal Message:</strong><br>${customMessage}</p>` : ''}

          <div style="text-align: center; margin: 30px 0;">
            <a href="${invitationLink}" 
               style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Accept Invitation
            </a>
          </div>

          <p><small>This invitation will expire on ${expiresAt.toLocaleDateString()}. If you don't want to accept this invitation, you can safely ignore this email.</small></p>
          
          <hr style="margin: 30px 0;">
          <p><small>If the button doesn't work, copy and paste this link into your browser:</small><br>
          <small>${invitationLink}</small></p>
        </div>
      `
    };

    await emailService.sendEmail(emailTemplate);

    // Log the action
    await AuditLog.create({
      adminId: req.admin._id,
      adminEmail: req.admin.email,
      action: 'admin_invitation_sent',
      resource: 'AdminInvite',
      resourceId: invite._id,
      details: {
        invitedEmail: email,
        role,
        level,
        team,
        expirationHours
      },
      ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown',
      riskLevel: 'medium'
    });

    res.status(201).json({
      success: true,
      message: 'Invitation sent successfully',
      data: {
        inviteId: invite._id,
        email,
        expiresAt,
        invitationLink
      }
    });
  } catch (error) {
    console.error('Send admin invitation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send invitation'
    });
  }
};

// Get invitation by token
export const getInvitationByToken = async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    const invite = await AdminInvite.findOne({ invitationToken: token })
      .populate('invitedBy', 'firstName lastName email');

    if (!invite) {
      return res.status(404).json({
        success: false,
        message: 'Invalid invitation token'
      });
    }

    if (invite.isExpired) {
      return res.status(400).json({
        success: false,
        message: 'Invitation has expired'
      });
    }

    if (invite.status !== 'pending' && invite.status !== 'approved') {
      return res.status(400).json({
        success: false,
        message: `Invitation has been ${invite.status}`
      });
    }

    res.json({
      success: true,
      data: invite
    });
  } catch (error) {
    console.error('Get invitation by token error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch invitation'
    });
  }
};

// Accept invitation
export const acceptInvitation = async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const { password, twoFactorEnabled = false } = req.body;

    const invite = await AdminInvite.findOne({ invitationToken: token });

    if (!invite) {
      return res.status(404).json({
        success: false,
        message: 'Invalid invitation token'
      });
    }

    if (invite.isExpired) {
      return res.status(400).json({
        success: false,
        message: 'Invitation has expired'
      });
    }

    if (invite.status !== 'pending' && invite.status !== 'approved') {
      return res.status(400).json({
        success: false,
        message: `Invitation has been ${invite.status}`
      });
    }

    // Check if admin already exists
    const existingAdmin = await Admin.findOne({ email: invite.email });
    if (existingAdmin) {
      return res.status(400).json({
        success: false,
        message: 'Admin with this email already exists'
      });
    }

    // Create admin account
    const admin = new Admin({
      email: invite.email,
      password,
      firstName: invite.firstName,
      lastName: invite.lastName,
      role: invite.role,
      level: invite.level,
      team: invite.team,
      permissions: invite.permissions,
      isEmailVerified: true,
      twoFactorEnabled
    });

    await admin.save();

    // Update invitation status
    invite.status = 'accepted';
    invite.acceptedAt = new Date();
    await invite.save();

    // Log the action
    await AuditLog.create({
      adminId: admin._id,
      adminEmail: admin.email,
      action: 'admin_invitation_accepted',
      resource: 'Admin',
      resourceId: admin._id,
      details: {
        invitedBy: invite.invitedBy,
        role: invite.role,
        level: invite.level,
        team: invite.team
      },
      ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown',
      riskLevel: 'low'
    });

    res.json({
      success: true,
      message: 'Account created successfully. You can now log in.',
      data: {
        adminId: admin._id,
        email: admin.email,
        role: admin.role
      }
    });
  } catch (error) {
    console.error('Accept invitation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to accept invitation'
    });
  }
};

// Get all invitations
export const getAllInvitations = async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 10, status, search, team, role } = req.query;
    
    const query: any = {};
    
    if (status) {
      query.status = status;
    }
    
    if (search) {
      query.$or = [
        { email: { $regex: search, $options: 'i' } },
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (team) {
      query.team = team;
    }
    
    if (role) {
      query.role = role;
    }

    const invitations = await AdminInvite.find(query)
      .populate('invitedBy', 'firstName lastName email')
      .populate('approvedBy', 'firstName lastName email')
      .populate('rejectedBy', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit as string) * 1)
      .skip((parseInt(page as string) - 1) * parseInt(limit as string));

    const total = await AdminInvite.countDocuments(query);

    res.json({
      success: true,
      data: {
        invitations,
        pagination: {
          current: parseInt(page as string),
          pages: Math.ceil(total / parseInt(limit as string)),
          total
        }
      }
    });
  } catch (error) {
    console.error('Get all invitations error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch invitations'
    });
  }
};

// Approve invitation
export const approveInvitation = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { approvalMessage } = req.body;

    const invite = await AdminInvite.findById(id);
    if (!invite) {
      return res.status(404).json({
        success: false,
        message: 'Invitation not found'
      });
    }

    if (invite.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Invitation is already ${invite.status}`
      });
    }

    invite.status = 'approved';
    invite.approvedBy = req.admin._id;
    invite.approvedAt = new Date();
    await invite.save();

    // Send approval notification email
    const emailTemplate = {
      to: invite.email,
      subject: `Your VeeFore Admin Panel invitation has been approved`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Invitation Approved</h2>
          <p>Hello ${invite.firstName},</p>
          <p>Your invitation to join the VeeFore Admin Panel has been approved by ${req.admin.firstName} ${req.admin.lastName}.</p>
          
          ${approvalMessage ? `<p><strong>Message from approver:</strong><br>${approvalMessage}</p>` : ''}

          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}/admin/accept-invitation?token=${invite.invitationToken}" 
               style="background-color: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Complete Setup
            </a>
          </div>

          <p><small>This invitation will expire on ${invite.expiresAt.toLocaleDateString()}.</small></p>
        </div>
      `
    };

    await emailService.sendEmail(emailTemplate);

    // Log the action
    await AuditLog.create({
      adminId: req.admin._id,
      adminEmail: req.admin.email,
      action: 'admin_invitation_approved',
      resource: 'AdminInvite',
      resourceId: invite._id,
      details: {
        invitedEmail: invite.email,
        approvalMessage
      },
      ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown',
      riskLevel: 'medium'
    });

    res.json({
      success: true,
      message: 'Invitation approved successfully'
    });
  } catch (error) {
    console.error('Approve invitation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve invitation'
    });
  }
};

// Reject invitation
export const rejectInvitation = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { rejectionReason } = req.body;

    const invite = await AdminInvite.findById(id);
    if (!invite) {
      return res.status(404).json({
        success: false,
        message: 'Invitation not found'
      });
    }

    if (invite.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Invitation is already ${invite.status}`
      });
    }

    invite.status = 'rejected';
    invite.rejectedBy = req.admin._id;
    invite.rejectedAt = new Date();
    invite.rejectionReason = rejectionReason;
    await invite.save();

    // Send rejection notification email
    const emailTemplate = {
      to: invite.email,
      subject: `Your VeeFore Admin Panel invitation has been declined`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Invitation Declined</h2>
          <p>Hello ${invite.firstName},</p>
          <p>Your invitation to join the VeeFore Admin Panel has been declined by ${req.admin.firstName} ${req.admin.lastName}.</p>
          
          ${rejectionReason ? `<p><strong>Reason:</strong><br>${rejectionReason}</p>` : ''}

          <p>If you believe this is an error, please contact the administrator.</p>
        </div>
      `
    };

    await emailService.sendEmail(emailTemplate);

    // Log the action
    await AuditLog.create({
      adminId: req.admin._id,
      adminEmail: req.admin.email,
      action: 'admin_invitation_rejected',
      resource: 'AdminInvite',
      resourceId: invite._id,
      details: {
        invitedEmail: invite.email,
        rejectionReason
      },
      ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown',
      riskLevel: 'medium'
    });

    res.json({
      success: true,
      message: 'Invitation rejected successfully'
    });
  } catch (error) {
    console.error('Reject invitation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject invitation'
    });
  }
};

// Resend invitation
export const resendInvitation = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { expirationHours = 48 } = req.body;

    const invite = await AdminInvite.findById(id);
    if (!invite) {
      return res.status(404).json({
        success: false,
        message: 'Invitation not found'
      });
    }

    if (invite.status === 'accepted') {
      return res.status(400).json({
        success: false,
        message: 'Invitation has already been accepted'
      });
    }

    // Generate new token and expiration
    const newToken = crypto.randomBytes(32).toString('hex');
    const newExpiresAt = new Date(Date.now() + expirationHours * 60 * 60 * 1000);

    invite.invitationToken = newToken;
    invite.expiresAt = newExpiresAt;
    invite.status = 'pending';
    await invite.save();

    // Send new invitation email
    const invitationLink = `${process.env.FRONTEND_URL}/admin/accept-invitation?token=${newToken}`;
    
    const emailTemplate = {
      to: invite.email,
      subject: `VeeFore Admin Panel Invitation (Resent)`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Invitation Resent</h2>
          <p>Hello ${invite.firstName},</p>
          <p>Your invitation to join the VeeFore Admin Panel has been resent by ${req.admin.firstName} ${req.admin.lastName}.</p>
          
          <div style="background-color: #f5f5f5; padding: 20px; margin: 20px 0; border-radius: 5px;">
            <h3>Invitation Details:</h3>
            <ul>
              <li><strong>Role:</strong> ${invite.role}</li>
              <li><strong>Level:</strong> ${invite.level}</li>
              <li><strong>Team:</strong> ${invite.team}</li>
              <li><strong>Expires:</strong> ${newExpiresAt.toLocaleDateString()}</li>
            </ul>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${invitationLink}" 
               style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Accept Invitation
            </a>
          </div>

          <p><small>This invitation will expire on ${newExpiresAt.toLocaleDateString()}.</small></p>
        </div>
      `
    };

    await emailService.sendEmail(emailTemplate);

    // Log the action
    await AuditLog.create({
      adminId: req.admin._id,
      adminEmail: req.admin.email,
      action: 'admin_invitation_resent',
      resource: 'AdminInvite',
      resourceId: invite._id,
      details: {
        invitedEmail: invite.email,
        expirationHours
      },
      ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown',
      riskLevel: 'low'
    });

    res.json({
      success: true,
      message: 'Invitation resent successfully',
      data: {
        expiresAt: newExpiresAt,
        invitationLink
      }
    });
  } catch (error) {
    console.error('Resend invitation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resend invitation'
    });
  }
};

// Get invitation statistics
export const getInvitationStatistics = async (req: AuthRequest, res: Response) => {
  try {
    const totalInvitations = await AdminInvite.countDocuments();
    const pendingInvitations = await AdminInvite.countDocuments({ status: 'pending' });
    const approvedInvitations = await AdminInvite.countDocuments({ status: 'approved' });
    const acceptedInvitations = await AdminInvite.countDocuments({ status: 'accepted' });
    const rejectedInvitations = await AdminInvite.countDocuments({ status: 'rejected' });
    const expiredInvitations = await AdminInvite.countDocuments({ status: 'expired' });

    const invitationsByTeam = await AdminInvite.aggregate([
      { $group: { _id: '$team', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    const invitationsByRole = await AdminInvite.aggregate([
      { $group: { _id: '$role', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    const recentInvitations = await AdminInvite.find()
      .populate('invitedBy', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .limit(5);

    res.json({
      success: true,
      data: {
        totalInvitations,
        pendingInvitations,
        approvedInvitations,
        acceptedInvitations,
        rejectedInvitations,
        expiredInvitations,
        invitationsByTeam,
        invitationsByRole,
        recentInvitations
      }
    });
  } catch (error) {
    console.error('Get invitation statistics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch invitation statistics'
    });
  }
};
