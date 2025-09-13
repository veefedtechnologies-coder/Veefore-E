import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import Admin from '../models/Admin';
import AdminInvite from '../models/AdminInvite';
import AuditLog from '../models/AuditLog';
import { AuthRequest } from '../middleware/auth';
import { validateLogin, validatePasswordChange } from '../middleware/validation';
import { sendEmail } from '../utils/email';
import { generateDeviceFingerprint } from '../utils/security';

export class AuthController {
  // Login
  static async login(req: Request, res: Response) {
    try {
      const { email, password, twoFactorCode, deviceFingerprint } = req.body;
      const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
      const userAgent = req.get('User-Agent') || 'unknown';

      // Find admin
      const admin = await Admin.findOne({ email: email.toLowerCase() });
      if (!admin) {
        await AuditLog.create({
          adminId: null,
          adminEmail: email,
          action: 'login_failed',
          resource: 'admin',
          details: { reason: 'Admin not found', email, ipAddress, userAgent },
          ipAddress,
          userAgent,
          riskLevel: 'medium'
        });

        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }

      // Check if account is locked
      if (admin.isLocked()) {
        await AuditLog.create({
          adminId: admin._id,
          adminEmail: admin.email,
          action: 'login_failed',
          resource: 'admin',
          details: { reason: 'Account locked', email, ipAddress, userAgent },
          ipAddress,
          userAgent,
          riskLevel: 'high'
        });

        return res.status(401).json({
          success: false,
          message: 'Account is temporarily locked due to multiple failed login attempts'
        });
      }

      // Check if account is active
      if (!admin.isActive) {
        await AuditLog.create({
          adminId: admin._id,
          adminEmail: admin.email,
          action: 'login_failed',
          resource: 'admin',
          details: { reason: 'Account inactive', email, ipAddress, userAgent },
          ipAddress,
          userAgent,
          riskLevel: 'medium'
        });

        return res.status(401).json({
          success: false,
          message: 'Account is deactivated'
        });
      }

      // Verify password
      const isPasswordValid = await admin.comparePassword(password);
      if (!isPasswordValid) {
        await admin.incLoginAttempts();
        
        await AuditLog.create({
          adminId: admin._id,
          adminEmail: admin.email,
          action: 'login_failed',
          resource: 'admin',
          details: { reason: 'Invalid password', email, ipAddress, userAgent },
          ipAddress,
          userAgent,
          riskLevel: 'medium'
        });

        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }

      // Check 2FA if enabled
      if (admin.twoFactorEnabled) {
        if (!twoFactorCode) {
          return res.status(400).json({
            success: false,
            message: 'Two-factor authentication code required',
            requires2FA: true
          });
        }

        const verified = speakeasy.totp.verify({
          secret: admin.twoFactorSecret!,
          encoding: 'base32',
          token: twoFactorCode,
          window: 2
        });

        if (!verified) {
          await AuditLog.create({
            adminId: admin._id,
            adminEmail: admin.email,
            action: 'login_failed',
            resource: 'admin',
            details: { reason: 'Invalid 2FA code', email, ipAddress, userAgent },
            ipAddress,
            userAgent,
            riskLevel: 'high'
          });

          return res.status(401).json({
            success: false,
            message: 'Invalid two-factor authentication code'
          });
        }
      }

      // Check IP whitelist
      if (admin.ipWhitelist.length > 0 && !admin.ipWhitelist.includes(ipAddress)) {
        await AuditLog.create({
          adminId: admin._id,
          adminEmail: admin.email,
          action: 'login_failed',
          resource: 'admin',
          details: { reason: 'IP not whitelisted', email, ipAddress, userAgent },
          ipAddress,
          userAgent,
          riskLevel: 'high'
        });

        return res.status(403).json({
          success: false,
          message: 'Access denied. IP address not whitelisted'
        });
      }

      // Reset login attempts
      await admin.resetLoginAttempts();

      // Generate username if missing
      if (!admin.username) {
        const emailPrefix = admin.email.split('@')[0];
        const baseUsername = emailPrefix.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        
        // Ensure username is unique
        let username = baseUsername;
        let counter = 1;
        
        while (await Admin.findOne({ username })) {
          username = `${baseUsername}${counter}`;
          counter++;
        }
        
        admin.username = username;
      }

      // Update last login
      admin.lastLogin = new Date();
      if (deviceFingerprint) {
        if (!admin.deviceFingerprints.includes(deviceFingerprint)) {
          admin.deviceFingerprints.push(deviceFingerprint);
        }
      }
      await admin.save();

      // Generate JWT token
      console.log('🔍 Login Debug:');
      console.log('  - JWT_SECRET exists:', !!process.env.JWT_SECRET);
      console.log('  - JWT_SECRET length:', process.env.JWT_SECRET?.length);
      
      let token;
      try {
        token = jwt.sign(
          { 
            adminId: admin._id, 
            email: admin.email, 
            role: admin.role,
            level: admin.level,
            permissions: admin.permissions
          },
          process.env.JWT_SECRET!,
          { expiresIn: '24h' }
        );
        
        console.log('  - Generated token length:', token.length);
        console.log('  - Generated token preview:', token.substring(0, 50) + '...');
      } catch (jwtError) {
        console.error('❌ JWT Generation Error:', jwtError);
        return res.status(500).json({
          success: false,
          message: 'Token generation failed'
        });
      }

      // Log successful login
      await AuditLog.create({
        adminId: admin._id,
        adminEmail: admin.email,
        action: 'login',
        resource: 'admin',
        details: { 
          email, 
          ipAddress, 
          userAgent, 
          deviceFingerprint,
          twoFactorUsed: admin.twoFactorEnabled
        },
        ipAddress,
        userAgent,
        deviceFingerprint,
        riskLevel: 'low'
      });

      res.json({
        success: true,
        message: 'Login successful',
        data: {
          token,
          admin: {
            id: admin._id,
            email: admin.email,
            username: admin.username,
            firstName: admin.firstName,
            lastName: admin.lastName,
            role: admin.role,
            level: admin.level,
            team: admin.team,
            permissions: admin.permissions,
            twoFactorEnabled: admin.twoFactorEnabled,
            lastLogin: admin.lastLogin
          }
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Logout
  static async logout(req: AuthRequest, res: Response) {
    try {
      await AuditLog.create({
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        action: 'logout',
        resource: 'admin',
        details: { 
          ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
          userAgent: req.get('User-Agent') || 'unknown'
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'low'
      });

      res.json({
        success: true,
        message: 'Logout successful'
      });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get current admin profile
  static async getProfile(req: AuthRequest, res: Response) {
    try {
      res.json({
        success: true,
        data: {
          admin: req.admin
        }
      });
    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Change password
  static async changePassword(req: AuthRequest, res: Response) {
    try {
      const { currentPassword, newPassword } = req.body;
      const admin = await Admin.findById(req.admin._id);

      if (!admin) {
        return res.status(404).json({
          success: false,
          message: 'Admin not found'
        });
      }

      // Verify current password
      const isCurrentPasswordValid = await admin.comparePassword(currentPassword);
      if (!isCurrentPasswordValid) {
        return res.status(400).json({
          success: false,
          message: 'Current password is incorrect'
        });
      }

      // Update password
      admin.password = newPassword;
      await admin.save();

      // Log password change
      await AuditLog.create({
        adminId: admin._id,
        adminEmail: admin.email,
        action: 'password_change',
        resource: 'admin',
        details: { 
          ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
          userAgent: req.get('User-Agent') || 'unknown'
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'high',
        isSensitive: true
      });

      res.json({
        success: true,
        message: 'Password changed successfully'
      });
    } catch (error) {
      console.error('Change password error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Setup 2FA
  static async setup2FA(req: AuthRequest, res: Response) {
    try {
      const admin = await Admin.findById(req.admin._id);
      if (!admin) {
        return res.status(404).json({
          success: false,
          message: 'Admin not found'
        });
      }

      if (admin.twoFactorEnabled) {
        return res.status(400).json({
          success: false,
          message: 'Two-factor authentication is already enabled'
        });
      }

      // Generate secret
      const secret = speakeasy.generateSecret({
        name: `VeeFore Admin (${admin.email})`,
        issuer: 'VeeFore'
      });

      // Generate QR code
      const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url!);

      // Store secret temporarily (not saved to DB yet)
      admin.twoFactorSecret = secret.base32;
      await admin.save();

      res.json({
        success: true,
        data: {
          secret: secret.base32,
          qrCode: qrCodeUrl,
          manualEntryKey: secret.base32
        }
      });
    } catch (error) {
      console.error('Setup 2FA error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Verify and enable 2FA
  static async verify2FA(req: AuthRequest, res: Response) {
    try {
      const { token } = req.body;
      const admin = await Admin.findById(req.admin._id);

      if (!admin) {
        return res.status(404).json({
          success: false,
          message: 'Admin not found'
        });
      }

      if (!admin.twoFactorSecret) {
        return res.status(400).json({
          success: false,
          message: '2FA setup not initiated'
        });
      }

      // Verify token
      const verified = speakeasy.totp.verify({
        secret: admin.twoFactorSecret,
        encoding: 'base32',
        token: token,
        window: 2
      });

      if (!verified) {
        return res.status(400).json({
          success: false,
          message: 'Invalid verification code'
        });
      }

      // Enable 2FA
      admin.twoFactorEnabled = true;
      await admin.save();

      // Log 2FA enable
      await AuditLog.create({
        adminId: admin._id,
        adminEmail: admin.email,
        action: '2fa_enable',
        resource: 'admin',
        details: { 
          ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
          userAgent: req.get('User-Agent') || 'unknown'
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'high',
        isSensitive: true
      });

      res.json({
        success: true,
        message: 'Two-factor authentication enabled successfully'
      });
    } catch (error) {
      console.error('Verify 2FA error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Disable 2FA
  static async disable2FA(req: AuthRequest, res: Response) {
    try {
      const { password, token } = req.body;
      const admin = await Admin.findById(req.admin._id);

      if (!admin) {
        return res.status(404).json({
          success: false,
          message: 'Admin not found'
        });
      }

      // Verify password
      const isPasswordValid = await admin.comparePassword(password);
      if (!isPasswordValid) {
        return res.status(400).json({
          success: false,
          message: 'Password is incorrect'
        });
      }

      // Verify 2FA token
      if (admin.twoFactorEnabled && admin.twoFactorSecret) {
        const verified = speakeasy.totp.verify({
          secret: admin.twoFactorSecret,
          encoding: 'base32',
          token: token,
          window: 2
        });

        if (!verified) {
          return res.status(400).json({
            success: false,
            message: 'Invalid verification code'
          });
        }
      }

      // Disable 2FA
      admin.twoFactorEnabled = false;
      admin.twoFactorSecret = undefined;
      await admin.save();

      // Log 2FA disable
      await AuditLog.create({
        adminId: admin._id,
        adminEmail: admin.email,
        action: '2fa_disable',
        resource: 'admin',
        details: { 
          ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
          userAgent: req.get('User-Agent') || 'unknown'
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'high',
        isSensitive: true
      });

      res.json({
        success: true,
        message: 'Two-factor authentication disabled successfully'
      });
    } catch (error) {
      console.error('Disable 2FA error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get admin sessions
  static async getSessions(req: AuthRequest, res: Response) {
    try {
      // This would typically be stored in Redis or similar
      // For now, we'll return a mock response
      res.json({
        success: true,
        data: {
          sessions: [
            {
              id: '1',
              ipAddress: req.ip || 'unknown',
              userAgent: req.get('User-Agent') || 'unknown',
              lastActive: new Date(),
              isCurrent: true
            }
          ]
        }
      });
    } catch (error) {
      console.error('Get sessions error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
}
