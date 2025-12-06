/**
 * P2-5 SECURITY: Enhanced Workspace Scoping & Multi-Tenant Isolation
 * 
 * Implements comprehensive workspace-based data isolation to prevent
 * cross-tenant access and ensure complete data segregation
 */

import { Request, Response, NextFunction } from 'express';

/**
 * P2-5.1: Workspace validation and access control
 */
export class WorkspaceIsolationService {
  /**
   * Validate workspace access for authenticated user
   */
  static async validateWorkspaceAccess(
    userId: string,
    workspaceId: string
  ): Promise<{ hasAccess: boolean; role?: string; reason?: string }> {
    try {
      // Import mongoose to avoid circular dependencies
      const { default: mongoose } = await import('mongoose');
      
      // Check if user has access to the workspace
      const Workspace = mongoose.model('Workspace');
      const workspace = await Workspace.findOne({
        _id: workspaceId,
        $or: [
          { ownerId: userId },
          { 'members.userId': userId }
        ]
      });

      if (!workspace) {
        return { 
          hasAccess: false, 
          reason: 'Workspace not found or access denied' 
        };
      }

      // Determine user role in workspace
      let role = 'member';
      if (workspace.ownerId.toString() === userId) {
        role = 'owner';
      } else {
        const member = workspace.members?.find((m: any) => m.userId.toString() === userId);
        if (member) {
          role = member.role || 'member';
        }
      }

      return { hasAccess: true, role };

    } catch (error) {
      console.error('🚨 P2-5: Workspace validation error:', error);
      return { 
        hasAccess: false, 
        reason: 'Workspace validation failed' 
      };
    }
  }

  /**
   * Validate resource ownership within workspace
   */
  static async validateResourceAccess(
    userId: string,
    workspaceId: string,
    resourceType: string,
    resourceId?: string
  ): Promise<{ hasAccess: boolean; reason?: string }> {
    try {
      // First validate workspace access
      const workspaceAccess = await WorkspaceIsolationService.validateWorkspaceAccess(
        userId, 
        workspaceId
      );

      if (!workspaceAccess.hasAccess) {
        return { hasAccess: false, reason: workspaceAccess.reason };
      }

      // If specific resource ID provided, validate it belongs to workspace
      if (resourceId) {
        const { default: mongoose } = await import('mongoose');
        
        let Model;
        switch (resourceType) {
          case 'social-account':
            Model = mongoose.model('SocialAccount');
            break;
          case 'content':
            Model = mongoose.model('Content');
            break;
          case 'automation':
            Model = mongoose.model('AutomationRule');
            break;
          default:
            return { hasAccess: false, reason: 'Unknown resource type' };
        }

        const resource = await Model.findOne({
          _id: resourceId,
          workspaceId: workspaceId
        });

        if (!resource) {
          return { 
            hasAccess: false, 
            reason: `${resourceType} not found in workspace` 
          };
        }
      }

      return { hasAccess: true };

    } catch (error) {
      console.error('🚨 P2-5: Resource validation error:', error);
      return { 
        hasAccess: false, 
        reason: 'Resource validation failed' 
      };
    }
  }
}

/**
 * P2-5.2: Workspace isolation middleware
 */
export function workspaceIsolationMiddleware(options: {
  requireWorkspace?: boolean;
  resourceType?: string;
  allowOwnerOnly?: boolean;
} = {}) {
  return async (req: any, res: Response, next: NextFunction) => {
    try {
      // Skip if no user authenticated
      if (!req.user) {
        if (options.requireWorkspace) {
          return res.status(401).json({ 
            error: 'Authentication required for workspace access' 
          });
        }
        return next();
      }

      // Get workspace ID from query, params, or body
      const workspaceId = req.query.workspaceId || 
                          req.params.workspaceId || 
                          req.body.workspaceId;

      if (options.requireWorkspace && !workspaceId) {
        return res.status(400).json({ 
          error: 'Workspace ID required' 
        });
      }

      if (workspaceId) {
        // Validate workspace access
        const workspaceAccess = await WorkspaceIsolationService.validateWorkspaceAccess(
          req.user.id,
          workspaceId
        );

        if (!workspaceAccess.hasAccess) {
          console.error(`🚨 P2-5: Workspace access denied for user ${req.user.id} to workspace ${workspaceId}`);
          return res.status(403).json({ 
            error: workspaceAccess.reason || 'Workspace access denied' 
          });
        }

        // Check owner-only restriction
        if (options.allowOwnerOnly && workspaceAccess.role !== 'owner') {
          return res.status(403).json({ 
            error: 'Owner access required for this operation' 
          });
        }

        // Validate resource access if resource type specified
        if (options.resourceType) {
          const resourceId = req.params.id || req.params.accountId || req.params.resourceId;
          
          const resourceAccess = await WorkspaceIsolationService.validateResourceAccess(
            req.user.id,
            workspaceId,
            options.resourceType,
            resourceId
          );

          if (!resourceAccess.hasAccess) {
            console.error(`🚨 P2-5: Resource access denied for ${options.resourceType} ${resourceId}`);
            return res.status(403).json({ 
              error: resourceAccess.reason || 'Resource access denied' 
            });
          }
        }

        // Add workspace info to request
        req.workspace = {
          id: workspaceId,
          role: workspaceAccess.role
        };
      }

      next();

    } catch (error) {
      console.error('🚨 P2-5: Workspace isolation middleware error:', error);
      res.status(500).json({ 
        error: 'Workspace validation failed' 
      });
    }
  };
}

/**
 * P2-5.3: Data query isolation helper
 */
export class DataIsolationHelper {
  /**
   * Add workspace filter to MongoDB queries
   */
  static addWorkspaceFilter(
    query: any,
    workspaceId: string,
    fieldName: string = 'workspaceId'
  ): any {
    return {
      ...query,
      [fieldName]: workspaceId
    };
  }

  /**
   * Validate and sanitize workspace data
   */
  static sanitizeWorkspaceData(
    data: any,
    workspaceId: string,
    allowedFields: string[] = []
  ): any {
    const sanitized = { ...data };
    
    // Ensure workspace ID is set correctly
    sanitized.workspaceId = workspaceId;
    
    // Remove any cross-workspace references
    const dangerousFields = ['_id', 'id', 'ownerId'];
    dangerousFields.forEach(field => {
      if (!allowedFields.includes(field)) {
        delete sanitized[field];
      }
    });
    
    return sanitized;
  }

  /**
   * Create workspace-scoped database query
   */
  static createScopedQuery(
    baseQuery: any,
    workspaceId: string,
    additionalFilters: any = {}
  ): any {
    return {
      ...baseQuery,
      ...additionalFilters,
      workspaceId: workspaceId
    };
  }
}

/**
 * P2-5.4: Cross-tenant access prevention
 */
export class CrossTenantProtection {
  private static suspiciousActivity = new Map<string, {
    attempts: number;
    lastAttempt: number;
  }>();

  private static readonly MAX_CROSS_TENANT_ATTEMPTS = 5;
  private static readonly LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

  /**
   * Log and track cross-tenant access attempts
   */
  static logCrossTenantAttempt(
    userId: string,
    attemptedWorkspaceId: string,
    accessType: string
  ): { shouldBlock: boolean; reason?: string } {
    const now = Date.now();
    const userKey = `${userId}-cross-tenant`;
    
    let activity = CrossTenantProtection.suspiciousActivity.get(userKey);
    if (!activity) {
      activity = { attempts: 0, lastAttempt: 0 };
    }

    // Reset counter if last attempt was more than lockout duration ago
    if (now - activity.lastAttempt > CrossTenantProtection.LOCKOUT_DURATION) {
      activity.attempts = 0;
    }

    activity.attempts++;
    activity.lastAttempt = now;
    CrossTenantProtection.suspiciousActivity.set(userKey, activity);

    // Log the attempt
    console.warn(`🚨 P2-5: Cross-tenant access attempt by user ${userId} to workspace ${attemptedWorkspaceId} (${accessType})`);
    console.warn(`🚨 P2-5: User has ${activity.attempts} cross-tenant attempts`);

    // Block if too many attempts
    if (activity.attempts >= CrossTenantProtection.MAX_CROSS_TENANT_ATTEMPTS) {
      console.error(`🚨 P2-5: Blocking user ${userId} due to excessive cross-tenant access attempts`);
      return { 
        shouldBlock: true, 
        reason: 'Too many cross-tenant access attempts. Account temporarily locked.' 
      };
    }

    return { shouldBlock: false };
  }

  /**
   * Clean up old suspicious activity records
   */
  static cleanupSuspiciousActivity(): void {
    const now = Date.now();
    for (const [key, activity] of CrossTenantProtection.suspiciousActivity.entries()) {
      if (now - activity.lastAttempt > CrossTenantProtection.LOCKOUT_DURATION) {
        CrossTenantProtection.suspiciousActivity.delete(key);
      }
    }
  }

  /**
   * Initialize cleanup scheduler
   */
  static initialize(): void {
    setInterval(() => {
      CrossTenantProtection.cleanupSuspiciousActivity();
    }, 5 * 60 * 1000); // Clean every 5 minutes

    console.log('🔐 P2-5: Cross-tenant protection initialized');
  }
}

/**
 * P2-5.5: Instagram account uniqueness constraint
 */
export class InstagramAccountConstraints {
  /**
   * Ensure Instagram account is only connected to one workspace
   */
  static async enforceUniqueInstagramAccount(
    instagramAccountId: string,
    workspaceId: string
  ): Promise<{ isUnique: boolean; conflictWorkspace?: string; reason?: string }> {
    try {
      const { default: mongoose } = await import('mongoose');
      
      // Check if Instagram account is already connected elsewhere
      const SocialAccount = mongoose.model('SocialAccount');
      const existingAccount = await SocialAccount.findOne({
        accountId: instagramAccountId,
        platform: 'instagram',
        workspaceId: { $ne: workspaceId }
      });

      if (existingAccount) {
        return {
          isUnique: false,
          conflictWorkspace: existingAccount.workspaceId,
          reason: 'Instagram account already connected to another workspace'
        };
      }

      return { isUnique: true };

    } catch (error) {
      console.error('🚨 P2-5: Instagram uniqueness check failed:', error);
      return {
        isUnique: false,
        reason: 'Failed to verify Instagram account uniqueness'
      };
    }
  }

  /**
   * Middleware to enforce Instagram account constraints
   */
  static uniquenessMiddleware() {
    return async (req: any, res: Response, next: NextFunction) => {
      // Only apply to Instagram account operations
      if (req.body.platform !== 'instagram' && req.query.platform !== 'instagram') {
        return next();
      }

      const accountId = req.body.accountId || req.params.accountId;
      const workspaceId = req.workspace?.id || req.query.workspaceId;

      if (accountId && workspaceId) {
        const uniquenessCheck = await InstagramAccountConstraints.enforceUniqueInstagramAccount(
          accountId,
          workspaceId
        );

        if (!uniquenessCheck.isUnique) {
          console.error(`🚨 P2-5: Instagram account uniqueness violation: ${accountId}`);
          return res.status(409).json({
            error: uniquenessCheck.reason,
            conflictWorkspace: uniquenessCheck.conflictWorkspace
          });
        }
      }

      next();
    };
  }
}

/**
 * P2-5.6: Initialize workspace isolation system
 */
export function initializeWorkspaceIsolation(): void {
  console.log('🔐 P2-5: Initializing enhanced workspace isolation system...');
  
  // Initialize cross-tenant protection
  CrossTenantProtection.initialize();
  
  console.log('🔐 P2-5: Workspace Isolation Features:');
  console.log('  ✅ Multi-tenant workspace access validation');
  console.log('  ✅ Resource-level access control');
  console.log('  ✅ Cross-tenant access attempt detection');
  console.log('  ✅ Instagram account uniqueness constraints');
  console.log('  ✅ Data query isolation helpers');
  console.log('  ✅ Workspace-scoped database operations');
  console.log('🔐 P2-5: Workspace isolation system ready for production');
}

/**
 * P2-5.7: Pre-configured middleware for common endpoints
 */

// Workspace-required endpoints
export const requireWorkspaceMiddleware = workspaceIsolationMiddleware({ 
  requireWorkspace: true 
});

// Social account isolation
export const socialAccountIsolationMiddleware = workspaceIsolationMiddleware({
  requireWorkspace: true,
  resourceType: 'social-account'
});

// Content isolation  
export const contentIsolationMiddleware = workspaceIsolationMiddleware({
  requireWorkspace: true,
  resourceType: 'content'
});

// Automation isolation
export const automationIsolationMiddleware = workspaceIsolationMiddleware({
  requireWorkspace: true,
  resourceType: 'automation'
});

// Owner-only operations
export const ownerOnlyMiddleware = workspaceIsolationMiddleware({
  requireWorkspace: true,
  allowOwnerOnly: true
});