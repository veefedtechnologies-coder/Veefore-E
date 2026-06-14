/**
 * Shared Authentication Middleware
 * 
 * Consolidated authentication middleware for both Main App and Admin Panel.
 * Provides JWT validation, session management, role-based access control,
 * and workspace permission checking.
 * 
 * Requirements:
 * - 5.3: Component Architecture Optimization - Extract auth middleware
 * - 6.4: Bundle Size Optimization - Consolidate duplicate auth logic
 */

import { Request, Response, NextFunction } from 'express';
import { admin } from '../../firebase-admin';
import { User } from '../../models/User/User';
import { AdminModel } from '../../models/Admin/Admin';
import Workspace from '../../models/Workspace';
import sessionManager from '../../middleware/sessionManager';

/**
 * Extended Request interface with authentication data
 */
export interface AuthenticatedRequest extends Request {
  user?: {
    uid: string;
    email?: string;
    displayName?: string;
    role?: 'user' | 'admin' | 'superadmin';
    isAdmin?: boolean;
    userId?: string;
    workspaceId?: string;
  };
  workspace?: {
    workspaceId: string;
    name: string;
    ownerId: string;
    members: string[];
    plan: string;
  };
}

/**
 * Authentication error types for consistent error handling
 */
export class AuthenticationError extends Error {
  constructor(
    message: string,
    public statusCode: number = 401,
    public code: string = 'AUTH_ERROR'
  ) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

/**
 * Main authentication middleware - validates JWT tokens from Firebase
 * 
 * Supports multiple token sources:
 * 1. Authorization header (Bearer token)
 * 2. Cookie-based session tokens
 * 
 * @throws {AuthenticationError} If token is missing or invalid
 */
export const authenticateUser = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    let token: string | null = null;

    // Try to get token from Authorization header first
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }

    // Fall back to cookie-based session token
    if (!token) {
      token = sessionManager.getAuthToken(req);
    }

    if (!token) {
      throw new AuthenticationError('Access token is required', 401, 'NO_TOKEN');
    }

    // Verify Firebase ID token
    const decodedToken = await admin.auth().verifyIdToken(token);

    // Look up user in database to get additional info
    const user = await User.findOne({ firebaseUid: decodedToken.uid });

    if (!user) {
      throw new AuthenticationError('User not found', 404, 'USER_NOT_FOUND');
    }

    // Attach user info to request
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email || user.email,
      displayName: decodedToken.name || user.displayName,
      role: 'user',
      userId: user._id?.toString() || user._id,
      workspaceId: user.workspaceId,
    };

    next();
  } catch (error: any) {
    if (error instanceof AuthenticationError) {
      return res.status(error.statusCode).json({
        error: error.message,
        code: error.code,
      });
    }

    // Handle Firebase-specific errors
    if (error?.code === 'auth/id-token-expired') {
      return res.status(401).json({
        error: 'Token expired',
        code: 'TOKEN_EXPIRED',
      });
    }

    if (error?.code === 'auth/argument-error') {
      return res.status(401).json({
        error: 'Invalid token format',
        code: 'INVALID_TOKEN_FORMAT',
      });
    }

    console.error('Authentication error:', error);
    return res.status(403).json({
      error: 'Invalid or expired token',
      code: 'AUTH_FAILED',
    });
  }
};

/**
 * Admin authentication middleware - validates admin JWT tokens
 * 
 * Used for admin panel routes that require admin privileges
 * 
 * @throws {AuthenticationError} If admin token is invalid or user is not admin
 */
export const requireAdmin = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      throw new AuthenticationError('Admin access token required', 401, 'NO_ADMIN_TOKEN');
    }

    // For admin routes, we might use a different token verification
    // Check if this is a Firebase token or admin JWT
    try {
      // Try Firebase token first
      const decodedToken = await admin.auth().verifyIdToken(token);
      
      // Check if user is an admin
      const adminUser = await AdminModel.findOne({ email: decodedToken.email });
      
      if (!adminUser || !adminUser.isActive) {
        throw new AuthenticationError('Admin privileges required', 403, 'NOT_ADMIN');
      }

      req.user = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        displayName: decodedToken.name,
        role: adminUser.role,
        isAdmin: true,
      };

      next();
    } catch (firebaseError) {
      // If Firebase token fails, this might be a direct admin JWT
      // In that case, the admin panel should handle its own auth
      throw new AuthenticationError('Invalid admin token', 401, 'INVALID_ADMIN_TOKEN');
    }
  } catch (error: any) {
    if (error instanceof AuthenticationError) {
      return res.status(error.statusCode).json({
        error: error.message,
        code: error.code,
      });
    }

    console.error('Admin authentication error:', error);
    return res.status(403).json({
      error: 'Admin authentication failed',
      code: 'ADMIN_AUTH_FAILED',
    });
  }
};

/**
 * Workspace validation middleware - ensures user has access to workspace
 * 
 * Validates that:
 * 1. User is authenticated
 * 2. Workspace exists
 * 3. User is a member or owner of the workspace
 * 
 * @throws {AuthenticationError} If workspace access is denied
 */
export const requireWorkspace = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AuthenticationError('Authentication required', 401, 'NO_AUTH');
    }

    // Get workspace ID from route params, query, or body
    const workspaceId = 
      req.params.workspaceId || 
      req.query.workspaceId || 
      req.body.workspaceId ||
      req.user.workspaceId;

    if (!workspaceId) {
      throw new AuthenticationError('Workspace ID required', 400, 'NO_WORKSPACE_ID');
    }

    // Fetch workspace from database
    const workspace = await Workspace.findOne({ workspaceId });

    if (!workspace) {
      throw new AuthenticationError('Workspace not found', 404, 'WORKSPACE_NOT_FOUND');
    }

    // Check if user is owner or member
    const userId = req.user.userId || req.user.uid;
    const isOwner = workspace.ownerId === userId;
    const isMember = workspace.members.includes(userId);

    if (!isOwner && !isMember) {
      throw new AuthenticationError(
        'Access denied to workspace',
        403,
        'WORKSPACE_ACCESS_DENIED'
      );
    }

    // Attach workspace to request
    req.workspace = {
      workspaceId: workspace.workspaceId,
      name: workspace.name,
      ownerId: workspace.ownerId,
      members: workspace.members,
      plan: workspace.plan,
    };

    next();
  } catch (error: any) {
    if (error instanceof AuthenticationError) {
      return res.status(error.statusCode).json({
        error: error.message,
        code: error.code,
      });
    }

    console.error('Workspace validation error:', error);
    return res.status(500).json({
      error: 'Workspace validation failed',
      code: 'WORKSPACE_VALIDATION_ERROR',
    });
  }
};

/**
 * Permission checking middleware factory
 * 
 * Creates middleware that checks if user has specific permissions
 * 
 * @param permission - Permission to check (e.g., 'workspace:admin', 'content:create')
 * @returns Middleware function
 */
export const checkPermission = (permission: string) => {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required', 401, 'NO_AUTH');
      }

      // Admin and superadmin have all permissions
      if (req.user.role === 'admin' || req.user.role === 'superadmin') {
        return next();
      }

      // Parse permission format: "resource:action"
      const [resource, action] = permission.split(':');

      // Check workspace-level permissions
      if (resource === 'workspace') {
        if (!req.workspace) {
          throw new AuthenticationError(
            'Workspace context required',
            400,
            'NO_WORKSPACE_CONTEXT'
          );
        }

        // Only workspace owner can perform admin actions
        if (action === 'admin' || action === 'delete' || action === 'settings') {
          const userId = req.user.userId || req.user.uid;
          if (req.workspace.ownerId !== userId) {
            throw new AuthenticationError(
              'Workspace owner privileges required',
              403,
              'INSUFFICIENT_PERMISSIONS'
            );
          }
        }

        return next();
      }

      // For other resources, members have full access within workspace
      if (req.workspace) {
        const userId = req.user.userId || req.user.uid;
        const isOwner = req.workspace.ownerId === userId;
        const isMember = req.workspace.members.includes(userId);

        if (isOwner || isMember) {
          return next();
        }
      }

      throw new AuthenticationError(
        `Permission denied: ${permission}`,
        403,
        'INSUFFICIENT_PERMISSIONS'
      );
    } catch (error: any) {
      if (error instanceof AuthenticationError) {
        return res.status(error.statusCode).json({
          error: error.message,
          code: error.code,
        });
      }

      console.error('Permission check error:', error);
      return res.status(500).json({
        error: 'Permission check failed',
        code: 'PERMISSION_CHECK_ERROR',
      });
    }
  };
};

/**
 * Optional authentication middleware
 * 
 * Attempts to authenticate user but doesn't fail if no token present.
 * Useful for routes that behave differently for authenticated vs anonymous users.
 */
export const optionalAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    let token: string | null = null;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }

    if (!token) {
      token = sessionManager.getAuthToken(req);
    }

    // If no token, continue without authentication
    if (!token) {
      return next();
    }

    // Try to verify token but don't fail if invalid
    try {
      const decodedToken = await admin.auth().verifyIdToken(token);
      const user = await User.findOne({ firebaseUid: decodedToken.uid });

      if (user) {
        req.user = {
          uid: decodedToken.uid,
          email: decodedToken.email || user.email,
          displayName: decodedToken.name || user.displayName,
          role: 'user',
          userId: user._id?.toString() || user._id,
          workspaceId: user.workspaceId,
        };
      }
    } catch (error) {
      // Silently fail - user remains unauthenticated
      console.warn('Optional auth failed:', error);
    }

    next();
  } catch (error) {
    // Never fail on optional auth
    next();
  }
};

/**
 * Backward compatibility exports
 * Maintains compatibility with existing codebase
 */
export const authenticateToken = authenticateUser;
export const authenticateJWT = authenticateUser;
export const requireAuth = authenticateUser;
