import { Request, Response, NextFunction } from 'express';
import { storage } from '../mongodb-storage';

import { Workspace } from '../domain/types';
import { WorkspaceMemberModel } from '../models/Workspace/WorkspaceMemberModel';

// Extend Express Request to include workspace data
declare global {
  namespace Express {
    interface Request {
      workspace?: Workspace;
      workspaceId?: string;
      workspaceRole?: string;
    }
  }
}

/**
 * CRITICAL SECURITY MIDDLEWARE: Validates workspace access and prevents cross-tenant data leakage
 *
 * Factory version — use createWorkspaceAccessValidator() for route-level usage.
 * For the WorkspaceMember-lookup plain middleware, use validateWorkspaceAccess directly.
 *
 * This middleware ensures that:
 * 1. User has authenticated access to the requested workspace
 * 2. Workspace exists and user is authorized (owner/member)
 * 3. Prevents cross-tenant data access attacks
 * 4. Provides consistent workspace validation across all routes
 */
export function createWorkspaceAccessValidator(options: {
  required?: boolean;
  source?: 'params' | 'query' | 'body' | 'headers' | 'auto';
  paramName?: string;
} = {}) {
  const { required = true, source = 'auto', paramName = 'workspaceId' } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Ensure user is authenticated
      if (!req.user || !(req.user as any).id) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      const userId = (req.user as any).id;
      const userEmail = (req.user as any).email;

      // Extract workspaceId from multiple possible sources
      let workspaceId: string | undefined;

      if (source === 'auto') {
        // Auto-detect from params, query, body, or headers
        workspaceId = req.params[paramName] ||
          req.params.workspaceId ||
          req.query[paramName] as string ||
          req.query.workspaceId as string ||
          req.body[paramName] ||
          req.body.workspaceId ||
          req.headers['x-workspace-id'] as string ||
          req.headers['workspace-id'] as string;
      } else if (source === 'params') {
        workspaceId = req.params[paramName] || req.params.workspaceId;
      } else if (source === 'query') {
        workspaceId = req.query[paramName] as string || req.query.workspaceId as string;
      } else if (source === 'body') {
        workspaceId = req.body[paramName] || req.body.workspaceId;
      } else if (source === 'headers') {
        workspaceId = req.headers['x-workspace-id'] as string || req.headers['workspace-id'] as string;
      }

      // Handle missing workspaceId
      if (!workspaceId) {
        if (required) {
          return res.status(400).json({
            error: 'Workspace ID is required',
            code: 'WORKSPACE_ID_REQUIRED',
            hint: 'Include workspaceId in request params, query, body, or headers'
          });
        } else {
          // Optional workspace - use user's default workspace
          const defaultWorkspace = await storage.getDefaultWorkspace(userId);
          if (defaultWorkspace) {
            workspaceId = defaultWorkspace.id.toString();
          } else {
            // No workspace available - continue without workspace validation
            return next();
          }
        }
      }

      // Validate workspace exists (workspaceId is guaranteed to exist at this point)
      let workspace;
      try {
        workspace = await storage.getWorkspace(workspaceId!);
      } catch (error: any) {
        console.error(`🚨 WORKSPACE VALIDATION: Database error for workspace ${workspaceId}:`, error);
        console.error('Stack:', error.stack);
        return res.status(500).json({
          error: 'Database connection error',
          code: 'DATABASE_ERROR',
          details: error.message,
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
      }

      if (!workspace) {
        console.log(`❌ WORKSPACE VALIDATION: Workspace ${workspaceId} not found for user ${userId}`);
        return res.status(404).json({
          error: 'Workspace not found',
          code: 'WORKSPACE_NOT_FOUND',
          workspaceId
        });
      }

      // CRITICAL SECURITY CHECK: Verify user has access to this workspace
      let userWorkspaces;
      try {
        userWorkspaces = await storage.getWorkspacesByUserId(userId);
      } catch (error: any) {
        console.error(`🚨 WORKSPACE VALIDATION: Database error getting user workspaces for ${userId}:`, error);
        console.error('Stack:', error.stack);
        return res.status(500).json({
          error: 'Database connection error',
          code: 'DATABASE_ERROR',
          details: error.message,
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
      }

      const hasAccess = userWorkspaces.some(w => w.id.toString() === workspaceId!.toString());

      if (!hasAccess) {
        // Log potential security breach or sync issue (redacted authorized list for privacy)
        console.warn(`🚨 [WORKSPACE-DENIED] User ${userId} attempted access to workspace ${workspaceId}`);

        return res.status(403).json({
          error: 'Access denied to workspace',
          code: 'WORKSPACE_ACCESS_DENIED',
          message: 'You do not have permission to access this workspace'
        });
      }

      // SECURITY SUCCESS: Attach validated workspace to request
      req.workspace = workspace;
      req.workspaceId = workspaceId;

      // Log successful workspace validation for audit
      console.log(`✅ WORKSPACE ACCESS: User ${userId} validated for workspace ${workspaceId} (${workspace.name})`);

      // Track user activity for smart polling hibernation (5 min debounce)
      // If lastActivity is missing (e.g. legacy workspace), assume it's active right now to prevent 56-year hibernation bug
      const lastActivity = workspace.lastActivity ? new Date(workspace.lastActivity).getTime() : Date.now();
      const daysInactive = (Date.now() - lastActivity) / (1000 * 60 * 60 * 24);
      const isHibernating = daysInactive > 7;
      const needsActivityUpdate = !workspace.lastActivity || (Date.now() - lastActivity > 5 * 60 * 1000);

      if (needsActivityUpdate) {
        // Fire and forget - update last activity asynchronously to avoid blocking the API request
        storage.updateWorkspace(workspaceId!, { lastActivity: new Date() }).catch(err => {
          console.error(`[HIBERNATION] Failed to update lastActivity for workspace ${workspaceId}:`, err.message);
        });
      }

      // WAKE-UP: If workspace was hibernating, immediately trigger a full sync + reset polling timers
      if (isHibernating && workspaceId) {
        (async () => {
          try {
            const { getRedisClient } = await import('../lib/redis');
            const redis = getRedisClient();
            const lockKey = `lock:wakeup:${workspaceId}`;
            // Set lock for 30 seconds, only if it doesn't exist (NX)
            const acquired = await redis.set(lockKey, 'locked', 'EX', 30, 'NX');
            if (!acquired) return; // Another pod is already waking it up
            
            console.log(`[WAKE-UP] 🌅 Workspace ${workspaceId} returning from ${daysInactive.toFixed(1)} days inactivity. Triggering wake-up sync...`);
            const { MetricsQueueManager } = await import('../queues/metricsQueue');
            const { SocialAccountModel } = await import('../models/Social/SocialAccount');
            const accounts = await SocialAccountModel.find({
              workspaceId: workspaceId,
              platform: 'instagram'
            });

            // Need to correctly get the decrypted token or clear token
            // Since metricsWorker delegates to SocialAccountService which fetches from DB natively,
            // we just need to ensure the account has *some* token type to wake it up.
            const validAccounts = accounts.filter(acc => acc.accessToken || acc.encryptedAccessToken);

            if (validAccounts.length > 0) {
              await MetricsQueueManager.wakeUpWorkspace(
                workspaceId,
                validAccounts.map(acc => ({
                  instagramAccountId: (acc as any)._id.toString(),
                  token: acc.accessToken || '',
                  engagementRate: (acc as any).engagementRate || 0,
                }))
              );
            }
          } catch (err: any) {
            console.error(`[WAKE-UP] Failed to trigger wake-up sync for workspace ${workspaceId}:`, err.message);
          }
        })();
      }

      next();
    } catch (error) {
      console.error('🚨 WORKSPACE VALIDATION ERROR:', error);
      return res.status(500).json({
        error: 'Workspace validation failed',
        code: 'WORKSPACE_VALIDATION_ERROR'
      });
    }
  };
}

/**
 * Plain Express middleware that validates workspace access using WorkspaceMember
 * lookup (not a factory — use this when you need header/query/body resolution
 * with role attachment for the workspace-meta-connection spec endpoints).
 *
 * Resolution order for workspaceId:
 *   1. req.headers['x-workspace-id']
 *   2. req.query.workspaceId
 *   3. req.body?.workspaceId
 *
 * Attaches req.workspaceId and req.workspaceRole on success.
 */
export async function validateWorkspaceMembership(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Resolve workspaceId from header → query → body
    const workspaceId: string | undefined =
      (req.headers['x-workspace-id'] as string | undefined) ||
      (req.query.workspaceId as string | undefined) ||
      (req.body?.workspaceId as string | undefined);

    if (!workspaceId) {
      res.status(400).json({
        success: false,
        error: {
          code: 'WORKSPACE_ID_REQUIRED',
          message: 'X-Workspace-ID header is required',
        },
      });
      return;
    }

    // userId is set by requireAuth middleware
    const userId: string | undefined = (req as any).userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Authentication required',
        },
      });
      return;
    }

    // Verify the user is an active member of the requested workspace
    const member = await WorkspaceMemberModel.findOne({
      workspaceId,
      userId,
      status: 'ACTIVE',
    });

    if (!member) {
      res.status(403).json({
        success: false,
        error: {
          code: 'WORKSPACE_ACCESS_DENIED',
          message: 'You are not a member of this workspace',
        },
      });
      return;
    }

    // Attach workspace context to request for downstream handlers
    (req as any).workspaceId = workspaceId;
    (req as any).workspaceRole = member.role;

    next();
  } catch (error) {
    console.error('🚨 validateWorkspaceAccess Error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'WORKSPACE_VALIDATION_ERROR',
        message: 'Workspace validation failed',
      },
    });
  }
}

/**
 * Helper function for routes that need workspace validation (factory version)
 * Usage: app.get('/api/route', requireAuth, validateWorkspace(), handler)
 */
export const validateWorkspace = (options?: Parameters<typeof createWorkspaceAccessValidator>[0]) =>
  createWorkspaceAccessValidator(options);

/**
 * validateWorkspaceAccess — factory alias maintained for backward compatibility.
 * All existing routes call this as validateWorkspaceAccess({ source: '...' }).
 * For the new plain (non-factory) middleware, use validateWorkspaceMembership directly.
 */
export const validateWorkspaceAccess = (options?: Parameters<typeof createWorkspaceAccessValidator>[0]) =>
  createWorkspaceAccessValidator(options);

/**
 * Optional workspace validation for routes that can work with or without workspace context
 * Usage: app.get('/api/route', requireAuth, optionalWorkspace(), handler)
 */
export const optionalWorkspace = () => createWorkspaceAccessValidator({ required: false });

/**
 * Validate workspace from URL params specifically (for RESTful routes)
 * Usage: app.get('/api/workspaces/:workspaceId/data', requireAuth, validateWorkspaceFromParams(), handler)
 */
export const validateWorkspaceFromParams = (paramName = 'workspaceId') =>
  createWorkspaceAccessValidator({ source: 'params', paramName });

/**
 * Validate workspace from query parameters
 * Usage: app.get('/api/data?workspaceId=xxx', requireAuth, validateWorkspaceFromQuery(), handler)
 */
export const validateWorkspaceFromQuery = (paramName = 'workspaceId') =>
  createWorkspaceAccessValidator({ source: 'query', paramName });

/**
 * Validate workspace from request body
 * Usage: app.post('/api/data', requireAuth, validateWorkspaceFromBody(), handler)
 */
export const validateWorkspaceFromBody = (paramName = 'workspaceId') =>
  createWorkspaceAccessValidator({ source: 'body', paramName });

/**
 * Validates that the current user has access to the workspace that owns the given account.
 * Crucial for preventing IDOR when modifying resources by ID directly.
 */
export function requireWorkspaceMember(idParam: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user || !(req.user as any).id) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const accountId = req.params[idParam];
      if (!accountId) {
        return res.status(400).json({ error: `Missing ${idParam} parameter` });
      }

      // We dynamically import to avoid circular dependencies
      const { SocialAccountModel } = await import('../models/Social/SocialAccount');
      const account = await SocialAccountModel.findById(accountId).lean();
      
      if (!account) {
        return res.status(404).json({ error: 'Resource not found' });
      }

      const workspaceId = account.workspaceId.toString();
      const userId = (req.user as any).id;
      
      // Verify workspace membership
      const userWorkspaces = await storage.getWorkspacesByUserId(userId);
      const hasAccess = userWorkspaces.some(w => w.id.toString() === workspaceId);

      if (!hasAccess) {
        console.warn(`🚨 [IDOR PREVENTED] User ${userId} attempted unauthorized access to resource ${accountId} in workspace ${workspaceId}`);
        return res.status(403).json({ error: 'Access denied to this resource' });
      }

      // Attach workspace details for downstream handlers
      req.workspaceId = workspaceId;
      
      next();
    } catch (error) {
      console.error('🚨 requireWorkspaceMember Error:', error);
      return res.status(500).json({ error: 'Resource authorization failed' });
    }
  };
}
