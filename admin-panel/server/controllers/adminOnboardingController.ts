import { Request, Response } from 'express';
import crypto from 'crypto';
import Admin from '../models/Admin';
import AdminInvite from '../models/AdminInvite';
import Role from '../models/Role';
import AuditLog from '../models/AuditLog';
import { EmailService } from '../utils/email';
import { AuthRequest } from '../middleware/auth';
import CredentialGenerator from '../utils/credentialGenerator';

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
    const invitationLink = `${process.env.FRONTEND_URL || 'http://localhost:3001'}/admin/accept-invitation?token=${invitationToken}`;
    
    const emailTemplate = {
      to: email,
      subject: `Invitation to join VeeFore Admin Panel`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Admin Invitation - VeeFore</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; background: #fff; }
            .header { background: #000; color: #fff; padding: 30px 20px; text-align: center; }
            .content { padding: 40px 30px; }
            .button { display: inline-block; padding: 15px 30px; background: #000; color: #fff; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
            .button:hover { background: #333; }
            .details { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #000; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; background: #f8f9fa; }
            .permissions { background: #e3f2fd; padding: 15px; border-radius: 8px; margin: 15px 0; }
            .permission-item { margin: 5px 0; padding: 5px 0; }
            .expiry { color: #d32f2f; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎉 VeeFore Admin Panel Invitation</h1>
              <p>You've been invited to join our admin team!</p>
            </div>
            <div class="content">
              <h2>Hello ${firstName} ${lastName}!</h2>
              <p>You have been invited to join the VeeFore Admin Panel by <strong>${req.admin.firstName} ${req.admin.lastName}</strong>.</p>
              
              <div class="details">
                <h3>📋 Invitation Details</h3>
                <ul>
                  <li><strong>Role:</strong> ${role.charAt(0).toUpperCase() + role.slice(1)}</li>
                  <li><strong>Level:</strong> Level ${level}</li>
                  <li><strong>Team:</strong> ${team.charAt(0).toUpperCase() + team.slice(1)}</li>
                  <li><strong>Expires:</strong> <span class="expiry">${expiresAt.toLocaleDateString()} at ${expiresAt.toLocaleTimeString()}</span></li>
                </ul>
              </div>

              <div class="permissions">
                <h4>🔐 Your Permissions Include:</h4>
                <div class="permission-item">• User Management & Analytics</div>
                <div class="permission-item">• Support Ticket Management</div>
                <div class="permission-item">• Content Moderation</div>
                <div class="permission-item">• System Monitoring</div>
                <div class="permission-item">• And ${permissions.length} more specific permissions</div>
              </div>

              ${customMessage ? `
                <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
                  <h4>💬 Personal Message from ${req.admin.firstName}:</h4>
                  <p style="margin: 0; font-style: italic;">"${customMessage}"</p>
                </div>
              ` : ''}

              <div style="text-align: center; margin: 30px 0;">
                <a href="${invitationLink}" class="button">
                  ✅ Accept Invitation & Set Up Account
                </a>
              </div>

              <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <h4>⚠️ Important Notes:</h4>
                <ul style="margin: 0;">
                  <li>This invitation will expire on <strong>${expiresAt.toLocaleDateString()}</strong></li>
                  <li>You'll receive secure login credentials after accepting</li>
                  <li>Please change your password on first login</li>
                  <li>Contact your administrator if you have any questions</li>
                </ul>
              </div>
            </div>
            <div class="footer">
              <p><strong>VeeFore Admin Panel</strong></p>
              <p>If the button doesn't work, copy and paste this link into your browser:</p>
              <p style="word-break: break-all; font-size: 12px; color: #999;">${invitationLink}</p>
              <p>&copy; 2024 VeeFore. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    try {
      await emailService.sendEmail(emailTemplate);
      console.log(`Admin invitation sent successfully to ${email}`);
    } catch (error) {
      console.error('Failed to send invitation email:', error);
      // Don't fail the entire request if email fails
    }

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
    const { twoFactorEnabled = false } = req.body;

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

    // Generate secure credentials
    const credentials = CredentialGenerator.generateCredentials(
      invite.email,
      invite.firstName,
      invite.lastName
    );

    // Hash the password
    const hashedPassword = await CredentialGenerator.hashPassword(credentials.password);

    // Create admin account
    const admin = new Admin({
      email: invite.email,
      username: credentials.username,
      password: hashedPassword,
      firstName: invite.firstName,
      lastName: invite.lastName,
      role: invite.role,
      level: invite.level,
      team: invite.team,
      permissions: invite.permissions,
      isEmailVerified: true,
      twoFactorEnabled,
      isActive: true,
      lastLoginAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await admin.save();

    // Update invitation status
    invite.status = 'accepted';
    invite.acceptedAt = new Date();
    await invite.save();

    // Send welcome email with credentials
    const welcomeEmailTemplate = {
      to: invite.email,
      subject: `Welcome to VeeFore Admin Panel - Your Account is Ready!`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Welcome to VeeFore Admin Panel</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; background: #fff; }
            .header { background: #000; color: #fff; padding: 30px 20px; text-align: center; }
            .content { padding: 40px 30px; }
            .credentials { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border: 2px solid #28a745; }
            .credential-item { margin: 10px 0; padding: 10px; background: #fff; border-radius: 4px; border-left: 4px solid #28a745; }
            .button { display: inline-block; padding: 15px 30px; background: #000; color: #fff; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; background: #f8f9fa; }
            .warning { background: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107; }
            .permissions { background: #e3f2fd; padding: 15px; border-radius: 8px; margin: 15px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎉 Welcome to VeeFore Admin Panel!</h1>
              <p>Your account has been successfully created</p>
            </div>
            <div class="content">
              <h2>Hello ${invite.firstName} ${invite.lastName}!</h2>
              <p>Congratulations! Your VeeFore Admin Panel account has been successfully created and is ready to use.</p>
              
              <div class="credentials">
                <h3>🔐 Your Login Credentials</h3>
                <div class="credential-item">
                  <strong>Username:</strong> <code style="background: #e9ecef; padding: 2px 6px; border-radius: 3px;">${credentials.username}</code>
                </div>
                <div class="credential-item">
                  <strong>Password:</strong> <code style="background: #e9ecef; padding: 2px 6px; border-radius: 3px;">${credentials.password}</code>
                </div>
                <div class="credential-item">
                  <strong>Email:</strong> ${invite.email}
                </div>
              </div>

              <div class="permissions">
                <h4>🔑 Your Role & Permissions</h4>
                <p><strong>Role:</strong> ${invite.role.charAt(0).toUpperCase() + invite.role.slice(1)} (Level ${invite.level})</p>
                <p><strong>Team:</strong> ${invite.team.charAt(0).toUpperCase() + invite.team.slice(1)}</p>
                <p><strong>Permissions:</strong> ${invite.permissions.length} specific permissions assigned</p>
              </div>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.FRONTEND_URL || 'http://localhost:3001'}/admin/login" class="button">
                  🚀 Access Admin Panel Now
                </a>
              </div>

              <div class="warning">
                <h4>⚠️ Security Important Notes:</h4>
                <ul style="margin: 0;">
                  <li><strong>Change your password immediately</strong> after first login</li>
                  <li>Keep your credentials secure and don't share them</li>
                  <li>Enable two-factor authentication for extra security</li>
                  <li>Contact your administrator if you have any issues</li>
                </ul>
              </div>

              <div style="background: #d1ecf1; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <h4>📚 Getting Started Guide:</h4>
                <ul style="margin: 0;">
                  <li>Review your assigned permissions and role responsibilities</li>
                  <li>Familiarize yourself with the admin panel interface</li>
                  <li>Check out the help documentation and guides</li>
                  <li>Set up your profile and preferences</li>
                </ul>
              </div>
            </div>
            <div class="footer">
              <p><strong>VeeFore Admin Panel</strong></p>
              <p>If you have any questions, please contact your administrator.</p>
              <p>&copy; 2024 VeeFore. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    try {
      await emailService.sendEmail(welcomeEmailTemplate);
      console.log(`Welcome email sent successfully to ${invite.email}`);
    } catch (error) {
      console.error('Failed to send welcome email:', error);
      // Don't fail the request if email fails
    }

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
        team: invite.team,
        username: credentials.username
      },
      ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown',
      riskLevel: 'low'
    });

    res.json({
      success: true,
      message: 'Account created successfully! Check your email for login credentials.',
      data: {
        adminId: admin._id,
        email: admin.email,
        username: credentials.username,
        role: admin.role,
        team: admin.team,
        level: admin.level,
        permissions: admin.permissions,
        loginUrl: `${process.env.FRONTEND_URL || 'http://localhost:3001'}/admin/login`
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
