import { Request, Response, NextFunction } from 'express';
import { logActionFromRequest } from '../utils/audit-logger';

interface AuditMiddlewareOptions {
  resource?: string;
  severity?: 'info' | 'warning' | 'critical';
  extractResourceId?: (req: Request) => string | undefined;
  extractWorkspaceId?: (req: Request) => string | undefined;
}

export const auditMiddleware = (action: string, options: AuditMiddlewareOptions = {}) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res);
    
    res.json = function(body: any) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const workspaceId = options.extractWorkspaceId?.(req) || 
                           req.params.workspaceId || 
                           req.body?.workspaceId;
        
        const resourceId = options.extractResourceId?.(req) || 
                          req.params.contentId || 
                          req.params.accountId ||
                          req.params.invitationId ||
                          body?.id ||
                          body?.data?.id;

        logActionFromRequest(req, action, {
          body: sanitizeBody(req.body),
          params: req.params,
          query: req.query,
          responseSuccess: body?.success !== undefined ? body.success : true
        }, {
          resource: options.resource || deriveResourceFromAction(action),
          workspaceId,
          resourceId,
          severity: options.severity || 'info'
        }).catch((error) => {
          console.error('[AUDIT MIDDLEWARE] Failed to log action:', error);
        });
      }
      
      return originalJson(body);
    };
    
    next();
  };
};

export const billingAuditMiddleware = (action: string) => {
  return auditMiddleware(action, {
    resource: 'billing',
    severity: 'warning'
  });
};

function sanitizeBody(body: any): any {
  if (!body) return body;
  
  const sensitiveFields = ['password', 'token', 'accessToken', 'refreshToken', 'secret', 'razorpay_signature'];
  const sanitized = { ...body };
  
  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }
  
  return sanitized;
}

function deriveResourceFromAction(action: string): string {
  const [resource] = action.split('.');
  return resource || 'unknown';
}

export default auditMiddleware;
