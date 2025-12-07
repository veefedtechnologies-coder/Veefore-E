/**
 * P4-4: Error Tracking & Monitoring System
 * 
 * Production-grade error monitoring with PII scrubbing, context capture,
 * and comprehensive error analysis for debugging and reliability
 */

import { Request, Response, NextFunction } from 'express';
import { logger, StructuredLogger } from './structured-logger';

/**
 * P4-4.1: Error tracking interfaces
 */
interface ErrorContext {
  userId?: string;
  workspaceId?: string;
  correlationId?: string;
  requestId?: string;
  userAgent?: string;
  ip?: string;
  url?: string;
  method?: string;
  statusCode?: number;
  responseTime?: number;
  additionalData?: Record<string, any>;
}

interface TrackedError {
  id: string;
  message: string;
  stack?: string;
  name: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  context: ErrorContext;
  timestamp: Date;
  fingerprint: string; // For grouping similar errors
  tags: string[];
  metadata: Record<string, any>;
}

/**
 * P4-4.2: PII scrubbing for error data
 */
class ErrorPIIScrubber {
  private static sensitivePatterns = [
    /password/i,
    /token/i,
    /secret/i,
    /key/i,
    /email/i,
    /phone/i,
    /ssn/i,
    /credit/i,
    /bank/i
  ];

  private static emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  private static tokenPattern = /\b[A-Za-z0-9_-]{20,}\b/g;
  private static creditCardPattern = /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g;
  private static phonePattern = /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g;

  /**
   * Scrub PII from error messages and stack traces
   */
  static scrubError(error: Error): Error {
    const scrubbedError = new Error(this.scrubString(error.message));
    scrubbedError.name = error.name;
    scrubbedError.stack = error.stack ? this.scrubString(error.stack) : undefined;
    
    return scrubbedError;
  }

  /**
   * Scrub PII from any object
   */
  static scrubData(data: any): any {
    if (typeof data === 'string') {
      return this.scrubString(data);
    }

    if (typeof data === 'object' && data !== null) {
      if (Array.isArray(data)) {
        return data.map(item => this.scrubData(item));
      }

      const scrubbed: any = {};
      for (const [key, value] of Object.entries(data)) {
        // Check if key suggests sensitive data
        if (this.sensitivePatterns.some(pattern => pattern.test(key))) {
          scrubbed[key] = '[REDACTED]';
        } else {
          scrubbed[key] = this.scrubData(value);
        }
      }
      return scrubbed;
    }

    return data;
  }

  /**
   * Scrub sensitive patterns from strings
   */
  private static scrubString(str: string): string {
    return str
      .replace(this.emailPattern, '***@***.***')
      .replace(this.tokenPattern, '[TOKEN_REDACTED]')
      .replace(this.creditCardPattern, '****-****-****-****')
      .replace(this.phonePattern, '***-***-****');
  }
}

/**
 * P4-4.3: Error tracking and analysis
 */
export class ErrorTracker {
  private static errors = new Map<string, TrackedError>();
  private static errorCounts = new Map<string, number>();
  private static maxStoredErrors = 1000;

  /**
   * P4-4.3a: Track and analyze error
   */
  static trackError(
    error: Error,
    context: ErrorContext = {},
    severity: 'low' | 'medium' | 'high' | 'critical' = 'medium',
    tags: string[] = []
  ): string {
    try {
      // Generate unique error ID
      const errorId = this.generateErrorId();
      
      // Scrub PII from error
      const scrubbedError = ErrorPIIScrubber.scrubError(error);
      const scrubbedContext = ErrorPIIScrubber.scrubData(context);

      // Generate fingerprint for grouping
      const fingerprint = this.generateFingerprint(scrubbedError, scrubbedContext);

      // Track error count
      const currentCount = this.errorCounts.get(fingerprint) || 0;
      this.errorCounts.set(fingerprint, currentCount + 1);

      // Create tracked error
      const trackedError: TrackedError = {
        id: errorId,
        message: scrubbedError.message,
        stack: scrubbedError.stack,
        name: scrubbedError.name,
        severity,
        context: scrubbedContext,
        timestamp: new Date(),
        fingerprint,
        tags: [...tags, this.classifyError(scrubbedError)],
        metadata: {
          occurrenceCount: currentCount + 1,
          environment: process.env.NODE_ENV || 'development',
          nodeVersion: process.version,
          platform: process.platform
        }
      };

      // Store error (with limit)
      this.errors.set(errorId, trackedError);
      this.enforceStorageLimit();

      // Log structured error
      this.logError(trackedError);

      // Send to external monitoring (if configured)
      this.sendToExternalMonitoring(trackedError);

      return errorId;

    } catch (trackingError) {
      // Fallback logging if error tracking fails
      logger.error({
        event: 'ERROR_TRACKING_FAILED',
        originalError: error.message,
        trackingError: trackingError instanceof Error ? trackingError.message : 'Unknown'
      }, '❌ Failed to track error');
      
      return 'tracking_failed';
    }
  }

  /**
   * P4-4.3b: Generate error fingerprint for grouping
   */
  private static generateFingerprint(error: Error, context: ErrorContext): string {
    const components = [
      error.name,
      error.message.replace(/\d+/g, 'N'), // Replace numbers with N
      error.stack?.split('\n')[0] || '', // First line of stack
      context.url?.replace(/\/\d+/g, '/:id') || '', // Normalize URLs
      context.method || ''
    ];

    // Simple hash
    let hash = 0;
    const str = components.join('|');
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }

    return `fp_${Math.abs(hash).toString(36)}`;
  }

  /**
   * P4-4.3c: Classify error type
   */
  private static classifyError(error: Error): string {
    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    if (name.includes('validation') || message.includes('validation')) {
      return 'validation_error';
    }
    if (name.includes('auth') || message.includes('auth') || message.includes('unauthorized')) {
      return 'authentication_error';
    }
    if (message.includes('network') || message.includes('connection') || message.includes('timeout')) {
      return 'network_error';
    }
    if (message.includes('database') || message.includes('query') || message.includes('connection')) {
      return 'database_error';
    }
    if (message.includes('external') || message.includes('api') || message.includes('service')) {
      return 'external_service_error';
    }
    if (name.includes('type') || message.includes('undefined') || message.includes('null')) {
      return 'type_error';
    }
    if (message.includes('permission') || message.includes('forbidden') || message.includes('access')) {
      return 'permission_error';
    }

    return 'general_error';
  }

  /**
   * P4-4.3d: Log structured error
   */
  private static logError(trackedError: TrackedError): void {
    const logData = {
      event: 'ERROR_TRACKED',
      errorId: trackedError.id,
      fingerprint: trackedError.fingerprint,
      severity: trackedError.severity,
      name: trackedError.name,
      message: trackedError.message,
      tags: trackedError.tags,
      occurrenceCount: trackedError.metadata.occurrenceCount,
      context: {
        userId: trackedError.context.userId,
        workspaceId: trackedError.context.workspaceId,
        correlationId: trackedError.context.correlationId,
        url: trackedError.context.url,
        method: trackedError.context.method
      }
    };

    switch (trackedError.severity) {
      case 'critical':
        logger.error(logData, `🚨 CRITICAL ERROR: ${trackedError.message}`);
        break;
      case 'high':
        logger.error(logData, `❌ HIGH SEVERITY ERROR: ${trackedError.message}`);
        break;
      case 'medium':
        logger.warn(logData, `⚠️ MEDIUM SEVERITY ERROR: ${trackedError.message}`);
        break;
      case 'low':
        logger.info(logData, `ℹ️ LOW SEVERITY ERROR: ${trackedError.message}`);
        break;
    }

    // Log to structured logger
    StructuredLogger.security(
      'error_occurred',
      {
        errorId: trackedError.id,
        severity: trackedError.severity,
        fingerprint: trackedError.fingerprint,
        tags: trackedError.tags
      },
      trackedError.context.correlationId,
      trackedError.severity === 'critical' ? 'critical' : 
      trackedError.severity === 'high' ? 'high' : 'medium'
    );
  }

  /**
   * P4-4.3e: Send to external monitoring (placeholder for Sentry/etc)
   */
  private static sendToExternalMonitoring(trackedError: TrackedError): void {
    const dsn = process.env.SENTRY_DSN || '';
    if (dsn) {
      logger.debug({
        event: 'EXTERNAL_MONITORING_SEND',
        errorId: trackedError.id,
        service: 'sentry',
        severity: trackedError.severity
      });
    } else {
      logger.debug({
        event: 'EXTERNAL_MONITORING_SKIP',
        errorId: trackedError.id,
        service: 'sentry'
      });
    }
  }

  /**
   * P4-4.4: Error analysis and retrieval
   */
  
  static getError(errorId: string): TrackedError | undefined {
    return this.errors.get(errorId);
  }

  static getErrorsByFingerprint(fingerprint: string): TrackedError[] {
    return Array.from(this.errors.values())
      .filter(error => error.fingerprint === fingerprint)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  static getRecentErrors(limit: number = 50): TrackedError[] {
    return Array.from(this.errors.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  static getErrorStats(): {
    totalErrors: number;
    uniqueFingerprints: number;
    errorsBySeverity: Record<string, number>;
    errorsByType: Record<string, number>;
    recentErrorRate: number; // errors per minute in last hour
  } {
    const errors = Array.from(this.errors.values());
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentErrors = errors.filter(e => e.timestamp > hourAgo);

    const severityCounts = errors.reduce((acc, error) => {
      acc[error.severity] = (acc[error.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const typeCounts = errors.reduce((acc, error) => {
      const type = error.tags.find(tag => tag.endsWith('_error')) || 'unknown';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalErrors: errors.length,
      uniqueFingerprints: new Set(errors.map(e => e.fingerprint)).size,
      errorsBySeverity: severityCounts,
      errorsByType: typeCounts,
      recentErrorRate: recentErrors.length / 60 // errors per minute
    };
  }

  /**
   * P4-4.5: Utility methods
   */
  
  private static generateErrorId(): string {
    return `err_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
  }

  private static enforceStorageLimit(): void {
    if (this.errors.size > this.maxStoredErrors) {
      // Remove oldest errors
      const sortedErrors = Array.from(this.errors.entries())
        .sort(([, a], [, b]) => a.timestamp.getTime() - b.timestamp.getTime());
      
      const toRemove = sortedErrors.slice(0, this.errors.size - this.maxStoredErrors);
      toRemove.forEach(([id]) => this.errors.delete(id));
    }
  }

  /**
   * P4-4.6: Clear stored errors (for testing)
   */
  static reset(): void {
    this.errors.clear();
    this.errorCounts.clear();
  }
}

/**
 * P4-4.7: Express error handling middleware
 */
export function errorTrackingMiddleware() {
  return (err: Error, req: Request, res: Response, next: NextFunction) => {
    const context: ErrorContext = {
      userId: req.user?.id,
      workspaceId: req.workspace?.id,
      correlationId: req.correlationId,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      url: req.originalUrl || req.url,
      method: req.method,
      statusCode: res.statusCode,
      responseTime: req.startTime ? Date.now() - req.startTime : undefined,
      additionalData: {
        headers: req.headers,
        params: req.params,
        query: req.query
      }
    };

    // Determine severity based on status code
    let severity: 'low' | 'medium' | 'high' | 'critical';
    if (res.statusCode >= 500) {
      severity = 'high';
    } else if (res.statusCode >= 400) {
      severity = 'medium';
    } else {
      severity = 'low';
    }

    // Track the error
    const errorId = ErrorTracker.trackError(err, context, severity, ['express_middleware']);

    // Add error ID to response headers for debugging
    res.setHeader('X-Error-ID', errorId);

    // Continue with next error handler
    next(err);
  };
}

/**
 * P4-4.8: Global error handlers
 */
export function setupGlobalErrorHandlers(): void {
  // Unhandled promise rejections
  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    ErrorTracker.trackError(error, {
      additionalData: { type: 'unhandled_rejection', promise: promise.toString() }
    }, 'critical', ['unhandled_rejection']);
  });

  // Uncaught exceptions
  process.on('uncaughtException', (error: Error) => {
    ErrorTracker.trackError(error, {
      additionalData: { type: 'uncaught_exception' }
    }, 'critical', ['uncaught_exception']);
    
    // Log and exit gracefully
    logger.error({
      event: 'UNCAUGHT_EXCEPTION',
      error: error.message,
      stack: error.stack
    }, '🚨 CRITICAL: Uncaught exception - shutting down');
    
    process.exit(1);
  });

  logger.info({
    event: 'GLOBAL_ERROR_HANDLERS_SETUP',
    handlers: ['unhandledRejection', 'uncaughtException']
  }, '🔐 P4-4: Global error handlers configured');
}

/**
 * P4-4.9: Initialize error tracking system
 */
export function initializeErrorTracking(): void {
  setupGlobalErrorHandlers();

  logger.info({
    event: 'ERROR_TRACKING_INITIALIZED',
    features: [
      'PII scrubbing for sensitive data',
      'Error fingerprinting for grouping',
      'Severity classification',
      'Context capture',
      'Structured logging integration',
      'Global error handlers',
      'Express middleware integration'
    ]
  }, '🔐 P4-4: Error tracking system ready for production');
}
