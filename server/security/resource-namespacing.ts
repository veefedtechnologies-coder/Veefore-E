/**
 * P2-9 SECURITY: Resource Namespacing per Tenant
 * 
 * Implements comprehensive resource namespacing to ensure all data and operations
 * are properly isolated by workspace (tenant) for complete multi-tenant security
 */

import { Request, Response, NextFunction } from 'express';

/**
 * P2-9.1: Resource namespace management
 */
export class ResourceNamespaceManager {
  /**
   * Generate workspace-specific resource identifiers
   */
  static generateNamespacedId(
    workspaceId: string, 
    resourceType: string, 
    resourceId?: string
  ): string {
    const namespace = `ws_${workspaceId}`;
    const type = resourceType.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const id = resourceId || Date.now().toString(36);
    
    return `${namespace}:${type}:${id}`;
  }

  /**
   * Parse namespaced resource identifier
   */
  static parseNamespacedId(namespacedId: string): {
    workspaceId: string;
    resourceType: string;
    resourceId: string;
    isValid: boolean;
  } {
    try {
      const parts = namespacedId.split(':');
      if (parts.length !== 3 || !parts[0].startsWith('ws_')) {
        return { workspaceId: '', resourceType: '', resourceId: '', isValid: false };
      }

      return {
        workspaceId: parts[0].substring(3), // Remove 'ws_' prefix
        resourceType: parts[1],
        resourceId: parts[2],
        isValid: true
      };
    } catch (error) {
      return { workspaceId: '', resourceType: '', resourceId: '', isValid: false };
    }
  }

  /**
   * Validate resource belongs to workspace
   */
  static validateResourceNamespace(
    namespacedId: string, 
    expectedWorkspaceId: string
  ): boolean {
    const parsed = ResourceNamespaceManager.parseNamespacedId(namespacedId);
    return parsed.isValid && parsed.workspaceId === expectedWorkspaceId;
  }
}

/**
 * P2-9.2: Content namespacing service
 */
export class ContentNamespaceService {
  /**
   * Generate workspace-specific content paths
   */
  static generateContentPath(
    workspaceId: string,
    contentType: 'posts' | 'media' | 'templates' | 'drafts',
    filename?: string
  ): string {
    const sanitizedWorkspace = workspaceId.replace(/[^a-zA-Z0-9-]/g, '_');
    const basePath = `workspaces/${sanitizedWorkspace}/${contentType}`;
    
    if (filename) {
      const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
      return `${basePath}/${sanitizedFilename}`;
    }
    
    return basePath;
  }

  /**
   * Validate content path belongs to workspace
   */
  static validateContentPath(path: string, workspaceId: string): boolean {
    const expectedPrefix = `workspaces/${workspaceId.replace(/[^a-zA-Z0-9-]/g, '_')}/`;
    return path.startsWith(expectedPrefix);
  }

  /**
   * Get workspace-specific media storage path
   */
  static getMediaStoragePath(
    workspaceId: string,
    mediaType: 'images' | 'videos' | 'thumbnails' | 'temp'
  ): string {
    return ContentNamespaceService.generateContentPath(workspaceId, 'media') + `/${mediaType}`;
  }
}

/**
 * P2-9.3: Database query namespacing
 */
export class DatabaseNamespacing {
  /**
   * Add workspace filter to all database queries
   */
  static addWorkspaceFilter<T>(
    query: T,
    workspaceId: string,
    fieldName: string = 'workspaceId'
  ): T & { [key: string]: string } {
    return {
      ...query,
      [fieldName]: workspaceId
    };
  }

  /**
   * Create workspace-scoped aggregation pipeline
   */
  static createWorkspacePipeline(
    workspaceId: string,
    additionalStages: any[] = []
  ): any[] {
    return [
      { $match: { workspaceId: workspaceId } },
      ...additionalStages
    ];
  }

  /**
   * Validate database operation workspace scope
   */
  static validateOperationScope(
    operation: any,
    workspaceId: string
  ): { isValid: boolean; reason?: string } {
    // Check if operation includes workspace filter
    if (!operation.workspaceId) {
      return { isValid: false, reason: 'Missing workspace filter in database operation' };
    }

    if (operation.workspaceId !== workspaceId) {
      return { isValid: false, reason: 'Database operation targets different workspace' };
    }

    return { isValid: true };
  }

  /**
   * Create workspace-safe update operations
   */
  static createSafeUpdate(
    updateData: any,
    workspaceId: string,
    allowedFields: string[] = []
  ): any {
    const safeUpdate = { ...updateData };
    
    // Ensure workspace ID cannot be changed
    safeUpdate.workspaceId = workspaceId;
    
    // Remove dangerous fields unless explicitly allowed
    const dangerousFields = ['_id', 'id', 'ownerId', 'createdBy'];
    dangerousFields.forEach(field => {
      if (!allowedFields.includes(field)) {
        delete safeUpdate[field];
      }
    });
    
    return safeUpdate;
  }
}

/**
 * P2-9.4: API endpoint namespacing
 */
export class APINamespacing {
  /**
   * Generate workspace-specific API endpoints
   */
  static generateEndpoint(
    baseEndpoint: string,
    workspaceId: string,
    resourceId?: string
  ): string {
    let endpoint = baseEndpoint;
    
    // Add workspace prefix if not present
    if (!endpoint.includes(':workspaceId')) {
      endpoint = endpoint.replace('/api/', `/api/workspaces/:workspaceId/`);
    }
    
    // Replace workspace parameter
    endpoint = endpoint.replace(':workspaceId', workspaceId);
    
    if (resourceId) {
      endpoint += `/${resourceId}`;
    }
    
    return endpoint;
  }

  /**
   * Validate API request workspace scope
   */
  static validateAPIRequest(
    req: Request,
    expectedWorkspaceId: string
  ): { isValid: boolean; reason?: string } {
    const requestWorkspaceId = req.params.workspaceId || 
                               req.query.workspaceId || 
                               req.body.workspaceId;

    if (!requestWorkspaceId) {
      return { isValid: false, reason: 'No workspace ID in request' };
    }

    if (requestWorkspaceId !== expectedWorkspaceId) {
      return { isValid: false, reason: 'Request workspace ID mismatch' };
    }

    return { isValid: true };
  }
}

/**
 * P2-9.5: Resource access control lists (ACLs)
 */
export class ResourceACL {
  private static resourcePermissions = new Map<string, {
    workspaceId: string;
    resourceType: string;
    permissions: string[];
    createdAt: Date;
  }>();

  /**
   * Set permissions for a workspace resource
   */
  static setResourcePermissions(
    resourceId: string,
    workspaceId: string,
    resourceType: string,
    permissions: string[]
  ): void {
    ResourceACL.resourcePermissions.set(resourceId, {
      workspaceId,
      resourceType,
      permissions,
      createdAt: new Date()
    });
  }

  /**
   * Check if user has permission for resource in workspace
   */
  static hasPermission(
    resourceId: string,
    workspaceId: string,
    requiredPermission: string
  ): boolean {
    const acl = ResourceACL.resourcePermissions.get(resourceId);
    
    if (!acl) {
      // Default: deny access if no ACL exists
      return false;
    }

    if (acl.workspaceId !== workspaceId) {
      // Resource belongs to different workspace
      return false;
    }

    return acl.permissions.includes(requiredPermission) || 
           acl.permissions.includes('*');
  }

  /**
   * Clean up expired ACL entries
   */
  static cleanupExpiredACLs(): void {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    for (const [resourceId, acl] of ResourceACL.resourcePermissions.entries()) {
      if (now - acl.createdAt.getTime() > maxAge) {
        ResourceACL.resourcePermissions.delete(resourceId);
      }
    }
  }
}

/**
 * P2-9.6: Namespacing middleware
 */
export function resourceNamespacingMiddleware(options: {
  resourceType: string;
  enforceNamespacing?: boolean;
  allowedOperations?: string[];
} = { resourceType: 'resource' }) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const workspaceId = req.workspace?.id || req.query.workspaceId;
      
      if (!workspaceId) {
        if (options.enforceNamespacing) {
          return res.status(400).json({ 
            error: 'Workspace ID required for resource access' 
          });
        }
        return next();
      }

      // Add namespace information to request
      req.namespace = {
        workspaceId,
        resourceType: options.resourceType,
        generateId: (id?: string) => ResourceNamespaceManager.generateNamespacedId(
          workspaceId, 
          options.resourceType, 
          id
        ),
        validateId: (namespacedId: string) => ResourceNamespaceManager.validateResourceNamespace(
          namespacedId,
          workspaceId
        )
      };

      // Validate operation if specified
      if (options.allowedOperations) {
        const method = req.method.toLowerCase();
        if (!options.allowedOperations.includes(method)) {
          return res.status(405).json({ 
            error: `Operation ${method} not allowed for ${options.resourceType}` 
          });
        }
      }

      console.log(`✅ P2-9: Resource namespacing applied for ${options.resourceType} in workspace ${workspaceId}`);
      next();

    } catch (error) {
      console.error('🚨 P2-9: Resource namespacing middleware error:', error);
      res.status(500).json({ 
        error: 'Resource namespacing validation failed' 
      });
    }
  };
}

/**
 * P2-9.7: Initialize resource namespacing system
 */
export function initializeResourceNamespacing(): void {
  console.log('🔐 P2-9: Initializing resource namespacing system...');
  
  // Initialize ACL cleanup
  setInterval(() => {
    ResourceACL.cleanupExpiredACLs();
  }, 60 * 60 * 1000); // Clean every hour

  console.log('🔐 P2-9: Resource Namespacing Features:');
  console.log('  ✅ Workspace-specific resource identifiers');
  console.log('  ✅ Content path namespacing and validation');
  console.log('  ✅ Database query workspace filtering');
  console.log('  ✅ API endpoint workspace scoping');
  console.log('  ✅ Resource access control lists (ACLs)');
  console.log('  ✅ Comprehensive namespace validation');
  console.log('🔐 P2-9: Resource namespacing system ready for production');
}

/**
 * P2-9.8: Pre-configured middleware for common resource types
 */

// Content namespacing
export const contentNamespacingMiddleware = resourceNamespacingMiddleware({
  resourceType: 'content',
  enforceNamespacing: true,
  allowedOperations: ['get', 'post', 'put', 'delete']
});

// Media namespacing
export const mediaNamespacingMiddleware = resourceNamespacingMiddleware({
  resourceType: 'media',
  enforceNamespacing: true,
  allowedOperations: ['get', 'post', 'delete']
});

// Analytics namespacing
export const analyticsNamespacingMiddleware = resourceNamespacingMiddleware({
  resourceType: 'analytics',
  enforceNamespacing: true,
  allowedOperations: ['get']
});

// Automation namespacing
export const automationNamespacingMiddleware = resourceNamespacingMiddleware({
  resourceType: 'automation',
  enforceNamespacing: true,
  allowedOperations: ['get', 'post', 'put', 'delete']
});