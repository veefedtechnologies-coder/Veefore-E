import { Request, Response, NextFunction } from 'express';
import { storage } from '../mongodb-storage';

import { Workspace } from '../domain/types';

// Extend Express Request to include workspace data
declare global {
  namespace Express {
    interface Request {
      workspace?: Workspace;
      workspaceId?: string;
    }
  }
}

/**
 * CRITICAL SECURITY MIDDLEWARE: Validates workspace access and prevents cross-tenant data leakage
 * 
 * This middleware ensures that:
 * 1. User has authenticated access to the requested workspace
 * 2. Workspace exists and user is authorized (owner/member) 
 * 3. Prevents cross-tenant data access attacks
 * 4. Provides consistent workspace validation across all routes
 */
export function validateWorkspaceAccess(options: {
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
          stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
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
          stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
        });
      }

      const hasAccess = userWorkspaces.some(w => w.id.toString() === workspaceId!.toString());

      if (!hasAccess) {
        // Log potential security breach or sync issue
        console.warn(`🚨 [WORKSPACE-DENIED] User ${userId} (${userEmail || 'unknown'}) attempted access to workspace ${workspaceId}`);
        console.warn(`🚨 [WORKSPACE-DENIED] User's authorized workspaces: ${userWorkspaces.map(w => w.id).join(', ')}`);

        return res.status(403).json({
          error: 'Access denied to workspace',
          code: 'WORKSPACE_ACCESS_DENIED',
          message: 'You do not have permission to access this workspace',
          debug: {
            requestedWorkspace: workspaceId,
            authorizedCount: userWorkspaces.length
          }
        });
      }

      // SECURITY SUCCESS: Attach validated workspace to request
      req.workspace = workspace;
      req.workspaceId = workspaceId;

      // Log successful workspace validation for audit
      console.log(`✅ WORKSPACE ACCESS: User ${userId} validated for workspace ${workspaceId} (${workspace.name})`);

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
 * Helper function for routes that need workspace validation
 * Usage: app.get('/api/route', requireAuth, validateWorkspace(), handler)
 */
export const validateWorkspace = (options?: Parameters<typeof validateWorkspaceAccess>[0]) =>
  validateWorkspaceAccess(options);

/**
 * Optional workspace validation for routes that can work with or without workspace context
 * Usage: app.get('/api/route', requireAuth, optionalWorkspace(), handler)
 */
export const optionalWorkspace = () => validateWorkspaceAccess({ required: false });

/**
 * Validate workspace from URL params specifically (for RESTful routes)
 * Usage: app.get('/api/workspaces/:workspaceId/data', requireAuth, validateWorkspaceFromParams(), handler)
 */
export const validateWorkspaceFromParams = (paramName = 'workspaceId') =>
  validateWorkspaceAccess({ source: 'params', paramName });

/**
 * Validate workspace from query parameters
 * Usage: app.get('/api/data?workspaceId=xxx', requireAuth, validateWorkspaceFromQuery(), handler)
 */
export const validateWorkspaceFromQuery = (paramName = 'workspaceId') =>
  validateWorkspaceAccess({ source: 'query', paramName });

/**
 * Validate workspace from request body
 * Usage: app.post('/api/data', requireAuth, validateWorkspaceFromBody(), handler)
 */
export const validateWorkspaceFromBody = (paramName = 'workspaceId') =>
  validateWorkspaceAccess({ source: 'body', paramName });