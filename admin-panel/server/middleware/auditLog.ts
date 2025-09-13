import { Request, Response, NextFunction } from 'express';
import AuditLog from '../models/AuditLog';
import { AuthRequest } from './auth';

interface AuditLogOptions {
  action: string;
  resource?: string;
  resourceId?: string;
  details?: any;
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
}

export const auditLog = (options: AuditLogOptions) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      // Store original res.json to capture response
      const originalJson = res.json;
      let responseData: any = null;
      let statusCode: number = 200;

      // Override res.json to capture response data
      res.json = function(data: any) {
        responseData = data;
        statusCode = res.statusCode;
        return originalJson.call(this, data);
      };

      // Store original res.status to capture status code
      const originalStatus = res.status;
      res.status = function(code: number) {
        statusCode = code;
        return originalStatus.call(this, code);
      };

      // Continue with the request
      await next();

      // Log the action after the request completes
      try {
        const auditEntry = {
          adminId: req.admin?._id || null,
          adminEmail: req.admin?.email || 'system',
          action: options.action,
          resource: options.resource || req.route?.path || req.path,
          resourceId: options.resourceId || req.params?.id || null,
          details: {
            ...options.details,
            method: req.method,
            url: req.originalUrl,
            statusCode,
            success: statusCode >= 200 && statusCode < 400,
            responseData: responseData ? {
              success: responseData.success,
              message: responseData.message
            } : null,
            userAgent: req.get('User-Agent') || 'unknown',
            timestamp: new Date()
          },
          ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
          userAgent: req.get('User-Agent') || 'unknown',
          riskLevel: options.riskLevel || 'low'
        };

        // Create audit log entry
        await AuditLog.create(auditEntry);
      } catch (auditError) {
        // Don't fail the request if audit logging fails
        console.error('Audit logging error:', auditError);
      }
    } catch (error) {
      // Don't fail the request if middleware fails
      console.error('Audit middleware error:', error);
      next();
    }
  };
};

export default auditLog;
