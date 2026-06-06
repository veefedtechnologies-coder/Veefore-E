import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { storage } from './storage';
import type { Admin, InsertAdmin } from '@shared/schema';

if (!process.env.JWT_SECRET) {
  console.error('FATAL ERROR: JWT_SECRET environment variable is missing.');
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '24h';

export interface AdminRequest extends Request {
  admin?: Admin;
}

// Hash password
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12;
  return bcrypt.hash(password, saltRounds);
}

// Verify password
export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

// Generate JWT token
export function generateToken(admin: Admin): string {
  return jwt.sign(
    { 
      id: admin.id, 
      email: admin.email, 
      username: admin.username,
      role: admin.role 
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// Generate session token
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Verify JWT token
export function verifyToken(token: string): any {
  try {
    return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
  } catch (error) {
    return null;
  }
}

// Admin authentication middleware
export async function requireAdminAuth(req: AdminRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);
    
    if (!decoded || typeof decoded === 'string' || !decoded.id || !decoded.role) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Check if admin exists and is active
    const admin = await storage.getAdmin(decoded.id);
    if (!admin || !admin.isActive) {
      return res.status(401).json({ error: 'Admin not found or inactive' });
    }

    req.admin = admin;
    next();
  } catch (error) {
    console.error('[ADMIN AUTH] Error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
}

// Check if admin has required role
export function requireRole(roles: string[]) {
  return (req: AdminRequest, res: Response, next: NextFunction) => {
    if (!req.admin) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!roles.includes(req.admin.role || '')) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
}

// Log admin action for audit trail
export async function logAdminAction(
  adminId: number,
  action: string,
  entity?: string,
  entityId?: string,
  oldValues?: any,
  newValues?: any,
  ipAddress?: string,
  userAgent?: string
) {
  try {
    await storage.createAuditLog({
      adminId,
      action,
      resource: entity || 'unknown', // Fix: provide resource field
      resourceId: entityId || '',
      oldValues,
      newValues,
      ipAddress,
      userAgent
    });
  } catch (error) {
    console.error('[AUDIT LOG] Error logging admin action:', error);
  }
}

// Create default admin if none exists
export async function createDefaultAdmin() {
  try {
    const admins = await storage.getAllAdmins();
    if (admins.length === 0) {
      const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD;
      
      if (!defaultPassword) {
        console.warn('[ADMIN SETUP] DEFAULT_ADMIN_PASSWORD not set. Skipping default admin creation.');
        return;
      }

      const hashedPassword = await hashPassword(defaultPassword);
      
      const defaultAdmin: InsertAdmin = {
        email: 'admin@veefore.com',
        username: 'admin',
        password: hashedPassword,
        role: 'superadmin',
        isActive: true
      };

      await storage.createAdmin(defaultAdmin);
      console.log('[ADMIN SETUP] Default admin created with credentials:');
      console.log('Email: admin@veefore.com');
      console.log('Username: admin');
      console.log('Password: [REDACTED]');
    }
  } catch (error) {
    console.error('[ADMIN SETUP] Error creating default admin:', error);
  }
}