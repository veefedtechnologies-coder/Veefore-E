/**
 * P4-1: Structured Logging with Correlation IDs
 * 
 * Production-grade structured logging using Pino with correlation tracking,
 * PII sanitization, and comprehensive audit trails for monitoring and debugging
 */

import { Request, Response, NextFunction } from 'express';
// Using built-in Node.js console with structured formatting
// import pino from 'pino'; // Package conflicts resolved with built-in implementation
import { randomUUID } from 'crypto';

/**
 * P4-1.1: Correlation ID management
 */
export class CorrelationManager {
  private static correlationStore = new Map<string, {
    correlationId: string;
    userId?: string;
    workspaceId?: string;
    timestamp: Date;
    userAgent?: string;
    ip?: string;
  }>();

  /**
   * Generate new correlation ID for request tracking
   */
  static generateCorrelationId(): string {
    return `corr_${randomUUID().replace(/-/g, '').substring(0, 12)}`;
  }

  /**
   * Store correlation context for request
   */
  static setCorrelationContext(
    correlationId: string,
    context: {
      userId?: string;
      workspaceId?: string;
      userAgent?: string;
      ip?: string;
    }
  ): void {
    this.correlationStore.set(correlationId, {
      correlationId,
      ...context,
      timestamp: new Date()
    });

    // Cleanup old entries (older than 1 hour)
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    for (const [id, data] of this.correlationStore.entries()) {
      if (data.timestamp < hourAgo) {
        this.correlationStore.delete(id);
      }
    }
  }

  /**
   * Get correlation context for ID
   */
  static getCorrelationContext(correlationId: string) {
    return this.correlationStore.get(correlationId);
  }

  /**
   * Clear correlation context
   */
  static clearCorrelationContext(correlationId: string): void {
    this.correlationStore.delete(correlationId);
  }
}

/**
 * P4-1.2: PII sanitization for logs
 */
class PIISanitizer {
  private static sensitiveFields = [
    'password', 'token', 'apiKey', 'secret', 'accessToken', 'refreshToken',
    'email', 'phone', 'ssn', 'creditCard', 'bankAccount', 'ip'
  ];

  private static emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  private static tokenPattern = /\b[A-Za-z0-9]{20,}\b/g;
  private static ipPattern = /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g;

  /**
   * Sanitize object by removing/masking PII
   */
  static sanitize(obj: any): any {
    if (!obj || typeof obj !== 'object') {
      return this.sanitizeString(obj);
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitize(item));
    }

    const sanitized: any = {};
    
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      
      // Mask sensitive fields
      if (this.sensitiveFields.some(field => lowerKey.includes(field))) {
        sanitized[key] = this.maskSensitiveValue(value);
      } else {
        sanitized[key] = this.sanitize(value);
      }
    }

    return sanitized;
  }

  /**
   * Sanitize string content
   */
  private static sanitizeString(str: any): any {
    if (typeof str !== 'string') return str;

    return str
      .replace(this.emailPattern, '***@***.***')
      .replace(this.tokenPattern, '***TOKEN***')
      .replace(this.ipPattern, '***.***.***.**');
  }

  /**
   * Mask sensitive values
   */
  private static maskSensitiveValue(value: any): string {
    if (typeof value === 'string') {
      if (value.length <= 4) return '****';
      return value.substring(0, 2) + '****' + value.substring(value.length - 2);
    }
    return '****';
  }
}

/**
 * P4-1.3: Built-in structured logger implementation
 */
class BuiltInLogger {
  private isDevelopment = process.env.NODE_ENV !== 'production';
  private baseData = {
    pid: process.pid,
    hostname: process.env.HOSTNAME || 'unknown',
    service: 'veefore-api',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  };

  private formatMessage(level: string, data: any, message?: string): string {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      ...this.baseData,
      ...PIISanitizer.sanitize(data),
      message
    };

    if (this.isDevelopment) {
      return `[${timestamp}] ${level.toUpperCase()}: ${message || ''} ${JSON.stringify(logEntry, null, 2)}`;
    }
    return JSON.stringify(logEntry);
  }

  info(data: any, message?: string): void {
    console.log(this.formatMessage('info', data, message));
  }

  warn(data: any, message?: string): void {
    console.warn(this.formatMessage('warn', data, message));
  }

  error(data: any, message?: string): void {
    console.error(this.formatMessage('error', data, message));
  }

  debug(data: any, message?: string): void {
    if (this.isDevelopment) {
      console.debug(this.formatMessage('debug', data, message));
    }
  }

  child(childData: any): BuiltInLogger {
    const childLogger = new BuiltInLogger();
    childLogger.baseData = { ...this.baseData, ...childData };
    return childLogger;
  }
}

// Create the main logger instance
export const logger = new BuiltInLogger();

/**
 * P4-1.4: Structured logging helpers
 */
export class StructuredLogger {
  /**
   * Log with correlation ID context
   */
  static withCorrelation(correlationId: string) {
    const context = CorrelationManager.getCorrelationContext(correlationId);
    
    return logger.child({
      correlationId,
      userId: context?.userId,
      workspaceId: context?.workspaceId,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log security events
   */
  static security(
    event: string,
    details: any,
    correlationId?: string,
    severity: 'low' | 'medium' | 'high' | 'critical' = 'medium'
  ): void {
    const logData = {
      event: 'SECURITY_EVENT',
      securityEvent: event,
      severity,
      details: PIISanitizer.sanitize(details),
      correlationId,
      timestamp: new Date().toISOString()
    };

    if (severity === 'critical' || severity === 'high') {
      logger.error(logData, `🚨 SECURITY: ${event}`);
    } else if (severity === 'medium') {
      logger.warn(logData, `⚠️ SECURITY: ${event}`);
    } else {
      logger.info(logData, `ℹ️ SECURITY: ${event}`);
    }
  }

  /**
   * Log API requests/responses
   */
  static apiCall(
    method: string,
    endpoint: string,
    statusCode: number,
    responseTime: number,
    correlationId?: string,
    additionalData?: any
  ): void {
    const logData = {
      event: 'API_CALL',
      method,
      endpoint,
      statusCode,
      responseTime,
      correlationId,
      ...PIISanitizer.sanitize(additionalData),
      timestamp: new Date().toISOString()
    };

    if (statusCode >= 500) {
      logger.error(logData, `❌ API ERROR: ${method} ${endpoint}`);
    } else if (statusCode >= 400) {
      logger.warn(logData, `⚠️ API WARNING: ${method} ${endpoint}`);
    } else {
      logger.info(logData, `✅ API SUCCESS: ${method} ${endpoint}`);
    }
  }

  /**
   * Log database operations
   */
  static database(
    operation: string,
    table: string,
    duration: number,
    correlationId?: string,
    error?: Error
  ): void {
    const logData = {
      event: 'DATABASE_OPERATION',
      operation,
      table,
      duration,
      correlationId,
      error: error ? {
        message: error.message,
        stack: error.stack?.split('\n').slice(0, 3) // Limit stack trace
      } : undefined,
      timestamp: new Date().toISOString()
    };

    if (error) {
      logger.error(logData, `❌ DB ERROR: ${operation} on ${table}`);
    } else if (duration > 1000) {
      logger.warn(logData, `⚠️ DB SLOW: ${operation} on ${table}`);
    } else {
      logger.debug(logData, `🗃️ DB: ${operation} on ${table}`);
    }
  }

  /**
   * Log external API calls
   */
  static externalAPI(
    service: string,
    endpoint: string,
    statusCode: number,
    responseTime: number,
    correlationId?: string,
    error?: Error
  ): void {
    const logData = {
      event: 'EXTERNAL_API_CALL',
      service,
      endpoint,
      statusCode,
      responseTime,
      correlationId,
      error: error ? PIISanitizer.sanitize({
        message: error.message,
        name: error.name
      }) : undefined,
      timestamp: new Date().toISOString()
    };

    if (error || statusCode >= 400) {
      logger.error(logData, `❌ EXTERNAL API ERROR: ${service}`);
    } else {
      logger.info(logData, `🌐 EXTERNAL API: ${service}`);
    }
  }

  /**
   * Log user actions
   */
  static userAction(
    action: string,
    userId: string,
    workspaceId: string,
    correlationId?: string,
    metadata?: any
  ): void {
    const logData = {
      event: 'USER_ACTION',
      action,
      userId,
      workspaceId,
      correlationId,
      metadata: PIISanitizer.sanitize(metadata),
      timestamp: new Date().toISOString()
    };

    logger.info(logData, `👤 USER ACTION: ${action}`);
  }

  /**
   * Log business metrics
   */
  static metric(
    metricName: string,
    value: number,
    unit: string,
    tags?: Record<string, string>,
    correlationId?: string
  ): void {
    const logData = {
      event: 'METRIC',
      metricName,
      value,
      unit,
      tags: PIISanitizer.sanitize(tags),
      correlationId,
      timestamp: new Date().toISOString()
    };

    logger.info(logData, `📊 METRIC: ${metricName} = ${value} ${unit}`);
  }
}

/**
 * P4-1.5: Express middleware for correlation tracking
 */
export function correlationMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Generate or extract correlation ID
    const correlationId = req.headers['x-correlation-id'] as string || 
                         CorrelationManager.generateCorrelationId();

    // Set correlation context
    CorrelationManager.setCorrelationContext(correlationId, {
      userId: req.user?.id,
      workspaceId: req.workspace?.id,
      userAgent: req.get('User-Agent'),
      ip: req.ip
    });

    // Add to request and response
    req.correlationId = correlationId;
    res.setHeader('X-Correlation-ID', correlationId);

    // Add cleanup on response finish
    res.on('finish', () => {
      // Log API call
      const responseTime = Date.now() - req.startTime;
      StructuredLogger.apiCall(
        req.method,
        req.route?.path || req.path,
        res.statusCode,
        responseTime,
        correlationId,
        {
          userAgent: req.get('User-Agent'),
          contentLength: res.get('Content-Length')
        }
      );

      // Cleanup correlation context after delay
      setTimeout(() => {
        CorrelationManager.clearCorrelationContext(correlationId);
      }, 5000);
    });

    req.startTime = Date.now();
    next();
  };
}

/**
 * P4-1.6: Initialize structured logging system
 */
export function initializeStructuredLogging(): void {
  logger.info({
    event: 'SYSTEM_STARTUP',
    message: 'Structured logging system initialized',
    features: [
      'Correlation ID tracking',
      'PII sanitization',
      'Security event logging',
      'API call tracking',
      'Database operation monitoring',
      'External API monitoring',
      'User action logging',
      'Business metrics tracking'
    ]
  }, '🔐 P4-1: Structured logging system ready for production');
}