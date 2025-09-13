import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import Admin from '../models/Admin';
import Role from '../models/Role';
import AuditLog from '../models/AuditLog';

export interface AuthRequest extends Request {
  admin?: any;
  user?: any;
  permissions?: string[];
  role?: any;
  dataAccessScope?: string;
  dataAccessFilters?: any;
}

// Authorization middleware
export const authorize = (requiredRoles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.admin) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const adminRole = req.admin.role;
    if (!requiredRoles.includes(adminRole)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }

    next();
  };
};

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Access denied. No token provided.' 
      });
    }

    // Debug logging
    console.log('🔍 Auth Debug:');
    console.log('  - JWT_SECRET exists:', !!process.env.JWT_SECRET);
    console.log('  - Token length:', token.length);
    console.log('  - Token preview:', token.substring(0, 50) + '...');
    console.log('  - Token format valid:', token.split('.').length === 3);

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    const admin = await Admin.findById(decoded.adminId).select('-password -twoFactorSecret');
    
    if (!admin) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid token. Admin not found.' 
      });
    }

    if (!admin.isActive) {
      return res.status(401).json({ 
        success: false, 
        message: 'Account is deactivated.' 
      });
    }

    if (admin.isLocked()) {
      return res.status(401).json({ 
        success: false, 
        message: 'Account is temporarily locked due to multiple failed login attempts.' 
      });
    }

    // Get role information and permissions
    const role = await Role.findOne({ name: admin.role });
    if (role) {
      req.role = role;
      req.permissions = role.permissions;
    } else {
      req.permissions = admin.permissions || [];
    }

    // Device and IP tracking
    const deviceFingerprint = req.header('X-Device-Fingerprint') || 'unknown';
    const userAgent = req.get('User-Agent') || 'unknown';
    const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';

    // Add device to history if tracking is enabled
    if (admin.securitySettings?.enableDeviceTracking) {
      admin.addDeviceToHistory(deviceFingerprint, userAgent, ipAddress);
      await admin.save();
    }

    // Check IP whitelist if enabled
    if (admin.ipWhitelist.length > 0 && !admin.isIPWhitelisted(ipAddress)) {
      await AuditLog.create({
        adminId: admin._id,
        adminEmail: admin.email,
        action: 'login_failed',
        resource: 'admin',
        details: `IP ${ipAddress} not in whitelist`,
        ipAddress,
        userAgent,
        riskLevel: 'high'
      });

      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. IP address not authorized.' 
      });
    }

    // Check if device is trusted (optional security check)
    if (admin.securitySettings?.enableDeviceTracking && !admin.isDeviceTrusted(deviceFingerprint)) {
      // Log suspicious activity but allow access
      await AuditLog.create({
        adminId: admin._id,
        adminEmail: admin.email,
        action: 'login',
        resource: 'admin',
        details: `New device: ${deviceFingerprint}`,
        ipAddress,
        userAgent,
        riskLevel: 'medium'
      });
    }

    req.admin = admin;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(401).json({ 
      success: false, 
      message: 'Invalid token.' 
    });
  }
};

export const requireRole = (roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.admin) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required.' 
      });
    }

    if (!roles.includes(req.admin.role)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Insufficient permissions.' 
      });
    }

    next();
  };
};

export const requirePermission = (permission: string) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.admin) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required.' 
      });
    }

    // Check both req.permissions (from role) and req.admin.permissions (direct)
    const userPermissions = req.permissions || req.admin.permissions || [];
    
    if (!userPermissions.includes(permission)) {
      console.log('🔍 Permission Check Debug:');
      console.log('  - Required permission:', permission);
      console.log('  - User permissions:', userPermissions);
      console.log('  - Admin permissions:', req.admin.permissions);
      console.log('  - Role permissions:', req.permissions);
      
      return res.status(403).json({ 
        success: false, 
        message: 'Insufficient permissions.' 
      });
    }

    next();
  };
};

export const requireLevel = (minLevel: number) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.admin) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required.' 
      });
    }

    if (req.admin.level < minLevel) {
      return res.status(403).json({ 
        success: false, 
        message: 'Insufficient level access.' 
      });
    }

    next();
  };
};

export const auditLog = (action: string, resource: string, riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low') => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const originalSend = res.send;
    
    res.send = function(data) {
      // Log the action after response is sent
      if (req.admin) {
        AuditLog.create({
          adminId: req.admin._id,
          adminEmail: req.admin.email,
          action,
          resource,
          resourceId: req.params.id || req.body.id,
          details: {
            method: req.method,
            url: req.originalUrl,
            body: req.body,
            query: req.query,
            params: req.params,
            responseStatus: res.statusCode
          },
          ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
          userAgent: req.get('User-Agent') || 'unknown',
          deviceFingerprint: req.get('X-Device-Fingerprint'),
          riskLevel,
          isSensitive: riskLevel === 'high' || riskLevel === 'critical',
          requiresVerification: riskLevel === 'critical'
        }).catch(console.error);
      }
      
      return originalSend.call(this, data);
    };
    
    next();
  };
};

export const checkIPWhitelist = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.admin) {
    return next();
  }

  const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
  
  if (req.admin.ipWhitelist.length > 0 && !req.admin.ipWhitelist.includes(clientIP)) {
    return res.status(403).json({ 
      success: false, 
      message: 'Access denied. IP address not whitelisted.' 
    });
  }

  next();
};

export const require2FA = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.admin) {
    return res.status(401).json({ 
      success: false, 
      message: 'Authentication required.' 
    });
  }

  if (req.admin.twoFactorEnabled && !req.body.twoFactorCode) {
    return res.status(400).json({ 
      success: false, 
      message: 'Two-factor authentication code required.' 
    });
  }

  next();
};

// Enhanced RBAC middleware functions

// Time-based access control middleware
export const requireTimeAccess = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.admin || !req.role) {
    return next();
  }

  const timeRestrictions = req.role.timeRestrictions;
  if (!timeRestrictions) {
    return next();
  }

  const now = new Date();
  const currentHour = now.getHours();
  const currentDay = now.getDay();

  // Check allowed hours
  if (timeRestrictions.allowedHours) {
    const { start, end } = timeRestrictions.allowedHours;
    if (currentHour < start || currentHour > end) {
      return res.status(403).json({ 
        success: false, 
        message: `Access denied. Allowed hours: ${start}:00 - ${end}:00` 
      });
    }
  }

  // Check allowed days
  if (timeRestrictions.allowedDays && timeRestrictions.allowedDays.length > 0) {
    if (!timeRestrictions.allowedDays.includes(currentDay)) {
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const allowedDayNames = timeRestrictions.allowedDays.map(day => dayNames[day]).join(', ');
      return res.status(403).json({ 
        success: false, 
        message: `Access denied. Allowed days: ${allowedDayNames}` 
      });
    }
  }

  next();
};

// IP-based access control middleware
export const requireIPAccess = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.admin || !req.role) {
    return next();
  }

  const ipRestrictions = req.role.ipRestrictions;
  if (!ipRestrictions) {
    return next();
  }

  const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';

  // Check blocked IPs
  if (ipRestrictions.blockedIPs && ipRestrictions.blockedIPs.includes(ipAddress)) {
    return res.status(403).json({ 
      success: false, 
      message: 'Access denied. IP address is blocked.' 
    });
  }

  // Check allowed IPs
  if (ipRestrictions.allowedIPs && ipRestrictions.allowedIPs.length > 0) {
    if (!ipRestrictions.allowedIPs.includes(ipAddress)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. IP address not in allowed list.' 
      });
    }
  }

  next();
};

// Data access scope middleware
export const requireDataAccess = (scope: 'all' | 'team' | 'own' | 'custom') => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.admin || !req.role) {
      return next();
    }

    const dataAccess = req.role.dataAccess;
    if (!dataAccess) {
      return next();
    }

    if (dataAccess.scope !== scope) {
      return res.status(403).json({ 
        success: false, 
        message: `Access denied. Required data scope: ${scope}` 
      });
    }

    // Add data access scope to request for use in controllers
    req.dataAccessScope = dataAccess.scope;
    req.dataAccessFilters = dataAccess.customFilters;

    next();
  };
};

// Team-based access control middleware
export const requireTeam = (teams: string | string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.admin) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required.' 
      });
    }

    const allowedTeams = Array.isArray(teams) ? teams : [teams];
    
    if (!allowedTeams.includes(req.admin.team)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. Required team: ' + allowedTeams.join(' or ') 
      });
    }

    next();
  };
};

// Module access control middleware
export const requireModuleAccess = (module: string, action: 'read' | 'write' | 'delete' | 'admin') => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.admin || !req.role) {
      return next();
    }

    const moduleAccess = req.role.moduleAccess;
    if (!moduleAccess || !moduleAccess.get(module)) {
      return res.status(403).json({ 
        success: false, 
        message: `Access denied. No access to module: ${module}` 
      });
    }

    const modulePermissions = moduleAccess.get(module);
    if (!modulePermissions[action]) {
      return res.status(403).json({ 
        success: false, 
        message: `Access denied. No ${action} permission for module: ${module}` 
      });
    }

    next();
  };
};

// Approval required middleware
export const requireApproval = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.admin || !req.role) {
    return next();
  }

  if (req.role.approvalRequired) {
    // Check if action requires approval
    const sensitiveActions = ['delete', 'update_role', 'change_permissions', 'refund_approve'];
    const action = req.body.action || req.method.toLowerCase();
    
    if (sensitiveActions.includes(action)) {
      return res.status(403).json({ 
        success: false, 
        message: 'This action requires approval from a higher-level admin.' 
      });
    }
  }

  next();
};

// Combined RBAC middleware
export const rbac = (options: {
  roles?: string | string[];
  permissions?: string | string[];
  level?: number;
  teams?: string | string[];
  dataScope?: 'all' | 'team' | 'own' | 'custom';
  module?: string;
  moduleAction?: 'read' | 'write' | 'delete' | 'admin';
  requireApproval?: boolean;
}) => {
  const middlewares = [authenticate];

  if (options.roles) {
    middlewares.push(requireRole(Array.isArray(options.roles) ? options.roles : [options.roles]));
  }

  if (options.permissions) {
    const permissions = Array.isArray(options.permissions) ? options.permissions : [options.permissions];
    permissions.forEach(permission => {
      middlewares.push(requirePermission(permission));
    });
  }

  if (options.level) {
    middlewares.push(requireLevel(options.level));
  }

  if (options.teams) {
    middlewares.push(requireTeam(options.teams));
  }

  if (options.dataScope) {
    middlewares.push(requireDataAccess(options.dataScope));
  }

  if (options.module && options.moduleAction) {
    middlewares.push(requireModuleAccess(options.module, options.moduleAction));
  }

  if (options.requireApproval) {
    middlewares.push(requireApproval);
  }

  middlewares.push(requireTimeAccess, requireIPAccess);

  return middlewares;
};
