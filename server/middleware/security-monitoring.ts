/**
 * P1-7 SECURITY: Security Monitoring & Logging
 * 
 * Comprehensive security monitoring system with structured logging,
 * attack detection, metrics collection, and audit trails
 */

import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

/**
 * P1-7.1: Security event categories and severity levels
 */
export enum SecurityEventType {
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization', 
  DATA_ACCESS = 'data_access',
  RATE_LIMIT = 'rate_limit',
  CORS = 'cors',
  XSS_ATTEMPT = 'xss_attempt',
  INJECTION_ATTEMPT = 'injection_attempt',
  FILE_UPLOAD = 'file_upload',
  ADMIN_ACTION = 'admin_action',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity'
}

export enum SecuritySeverity {
  LOW = 'low',
  MEDIUM = 'medium', 
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface SecurityEvent {
  id: string;
  timestamp: string;
  type: SecurityEventType;
  severity: SecuritySeverity;
  userId?: string;
  workspaceId?: string;
  ip: string;
  userAgent: string;
  endpoint: string;
  method: string;
  correlationId: string;
  message: string;
  metadata?: any;
  blocked: boolean;
  response?: {
    statusCode: number;
    responseTime: number;
  };
}

/**
 * P1-7.1: In-memory security event store with rotation
 */
class SecurityEventStore {
  private events: SecurityEvent[] = [];
  private maxEvents = 10000; // Keep last 10k events in memory
  
  addEvent(event: SecurityEvent) {
    this.events.push(event);
    
    // Rotate events if we exceed max
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }
    
    // Log to console with structured format
    this.logEvent(event);
    
    // Check for attack patterns
    this.analyzeForAttacks(event);
  }
  
  private logEvent(event: SecurityEvent) {
    const logLevel = this.getLogLevel(event.severity);
    const logMessage = `🔒 SECURITY [${event.severity.toUpperCase()}] ${event.type}: ${event.message}`;
    const logData = {
      id: event.id,
      correlationId: event.correlationId,
      ip: event.ip,
      endpoint: event.endpoint,
      method: event.method,
      userId: event.userId,
      blocked: event.blocked,
      timestamp: event.timestamp
    };
    
    switch (logLevel) {
      case 'error':
        console.error(logMessage, logData);
        break;
      case 'warn':
        console.warn(logMessage, logData);
        break;
      default:
        console.log(logMessage, logData);
    }
  }
  
  private getLogLevel(severity: SecuritySeverity): string {
    switch (severity) {
      case SecuritySeverity.CRITICAL:
      case SecuritySeverity.HIGH:
        return 'error';
      case SecuritySeverity.MEDIUM:
        return 'warn';
      default:
        return 'info';
    }
  }
  
  private analyzeForAttacks(event: SecurityEvent) {
    // P1-7.2: Simple attack pattern detection
    if (event.severity === SecuritySeverity.HIGH || event.severity === SecuritySeverity.CRITICAL) {
      this.triggerSecurityAlert(event);
    }
    
    // Check for rapid fire attacks from same IP
    const recentEvents = this.getRecentEventsByIP(event.ip, 300000); // 5 minutes
    if (recentEvents.length > 20) {
      console.error(`🚨 SECURITY ALERT: Potential attack from IP ${event.ip} - ${recentEvents.length} events in 5 minutes`);
    }
  }
  
  private triggerSecurityAlert(event: SecurityEvent) {
    console.error(`🚨 SECURITY ALERT: ${event.type} - ${event.message}`, {
      severity: event.severity,
      ip: event.ip,
      endpoint: event.endpoint,
      correlationId: event.correlationId
    });
  }
  
  getRecentEvents(minutes: number = 60): SecurityEvent[] {
    const cutoff = Date.now() - (minutes * 60 * 1000);
    return this.events.filter(event => new Date(event.timestamp).getTime() > cutoff);
  }
  
  getRecentEventsByIP(ip: string, milliseconds: number = 3600000): SecurityEvent[] {
    const cutoff = Date.now() - milliseconds;
    return this.events.filter(event => 
      event.ip === ip && new Date(event.timestamp).getTime() > cutoff
    );
  }
  
  getEventsByType(type: SecurityEventType, hours: number = 24): SecurityEvent[] {
    const cutoff = Date.now() - (hours * 60 * 60 * 1000);
    return this.events.filter(event => 
      event.type === type && new Date(event.timestamp).getTime() > cutoff
    );
  }
  
  getSecurityMetrics(hours: number = 24) {
    const events = this.getRecentEvents(hours * 60);
    
    const metrics = {
      totalEvents: events.length,
      byType: {} as Record<string, number>,
      bySeverity: {} as Record<string, number>,
      topIPs: {} as Record<string, number>,
      blockedEvents: events.filter(e => e.blocked).length,
      criticalEvents: events.filter(e => e.severity === SecuritySeverity.CRITICAL).length
    };
    
    events.forEach(event => {
      metrics.byType[event.type] = (metrics.byType[event.type] || 0) + 1;
      metrics.bySeverity[event.severity] = (metrics.bySeverity[event.severity] || 0) + 1;
      metrics.topIPs[event.ip] = (metrics.topIPs[event.ip] || 0) + 1;
    });
    
    return metrics;
  }
}

// Global security event store
export const securityEventStore = new SecurityEventStore();

/**
 * P1-7.1: Correlation ID middleware for request tracing
 */
export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction) {
  // Generate or use existing correlation ID
  const correlationId = (req.headers['x-correlation-id'] as string) || randomUUID();
  
  // Add to request object
  req.correlationId = correlationId;
  
  // Add to response headers
  res.setHeader('X-Correlation-ID', correlationId);
  
  next();
}

/**
 * P1-7.1: Main security logging middleware
 */
export function securityLoggingMiddleware(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();
  
  // Extract request info
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const userAgent = req.headers['user-agent'] || 'unknown';
  const correlationId = req.correlationId || randomUUID();
  
  // Only log security-relevant requests to reduce noise
  const isSecurityRelevant = req.path.includes('/admin') || req.path.includes('/oauth') || req.path.includes('/auth');
  if (isSecurityRelevant) {
    console.log(`🔍 SECURITY REQUEST: ${req.method} ${req.path} [${correlationId}] from ${ip}`);
  }
  
  // Capture response
  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    const statusCode = res.statusCode;
    
    // Determine if this is a security-relevant event
    if (statusCode >= 400 || req.path.includes('/admin') || req.path.includes('/oauth')) {
      const severity = statusCode >= 500 ? SecuritySeverity.HIGH : 
                     statusCode >= 400 ? SecuritySeverity.MEDIUM : SecuritySeverity.LOW;
      
      const event: SecurityEvent = {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        type: getEventType(req.path, statusCode),
        severity,
        userId: req.user?.id,
        workspaceId: req.user?.workspaceId || (req.query.workspaceId as string),
        ip,
        userAgent,
        endpoint: req.path,
        method: req.method,
        correlationId,
        message: `${req.method} ${req.path} responded with ${statusCode}`,
        blocked: statusCode === 403 || statusCode === 429,
        response: { statusCode, responseTime },
        metadata: {
          query: req.query,
          body: sanitizeBody(req.body),
          headers: sanitizeHeaders(req.headers)
        }
      };
      
      securityEventStore.addEvent(event);
    }
    
    // Only log security-relevant request endings
    if (isSecurityRelevant || statusCode >= 400) {
      console.log(`🔍 SECURITY RESPONSE: ${req.method} ${req.path} [${correlationId}] ${statusCode} (${responseTime}ms)`);
    }
  });
  
  next();
}

/**
 * P1-7.2: Attack detection middleware
 */
export function attackDetectionMiddleware(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const path = req.path;
  const body = req.body;
  const query = req.query;
  
  // Check for common attack patterns
  const attacks = detectAttackPatterns(path, body, query, req.headers);
  
  if (attacks.length > 0) {
    attacks.forEach(attack => {
      const event: SecurityEvent = {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        type: attack.type,
        severity: attack.severity,
        userId: req.user?.id,
        ip,
        userAgent: req.headers['user-agent'] || 'unknown',
        endpoint: path,
        method: req.method,
        correlationId: req.correlationId || randomUUID(),
        message: attack.message,
        blocked: attack.shouldBlock,
        metadata: attack.evidence
      };
      
      securityEventStore.addEvent(event);
      
      if (attack.shouldBlock) {
        console.error(`🚨 BLOCKING REQUEST: ${attack.message}`);
        return res.status(403).json({
          error: 'Security policy violation',
          code: 'SECURITY_BLOCK',
          correlationId: event.correlationId
        });
      }
    });
  }
  
  next();
}

/**
 * P1-7.3: Security metrics endpoint
 */
export function securityMetricsHandler(req: Request, res: Response) {
  const hours = parseInt(req.query.hours as string) || 24;
  const metrics = securityEventStore.getSecurityMetrics(hours);
  
  res.json({
    timeframe: `${hours} hours`,
    metrics,
    timestamp: new Date().toISOString()
  });
}

/**
 * P1-7.4: Audit trail for privileged operations
 */
export function auditTrailMiddleware(operation: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const event: SecurityEvent = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      type: SecurityEventType.ADMIN_ACTION,
      severity: SecuritySeverity.MEDIUM,
      userId: req.user?.id,
      workspaceId: req.user?.workspaceId,
      ip: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      endpoint: req.path,
      method: req.method,
      correlationId: req.correlationId || randomUUID(),
      message: `Privileged operation: ${operation}`,
      blocked: false,
      metadata: {
        operation,
        params: req.params,
        body: sanitizeBody(req.body)
      }
    };
    
    securityEventStore.addEvent(event);
    next();
  };
}

/**
 * Helper functions
 */
function getEventType(path: string, statusCode: number): SecurityEventType {
  if (path.includes('/auth') || path.includes('/login')) return SecurityEventType.AUTHENTICATION;
  if (path.includes('/admin')) return SecurityEventType.ADMIN_ACTION;
  if (statusCode === 429) return SecurityEventType.RATE_LIMIT;
  if (statusCode === 403) return SecurityEventType.AUTHORIZATION;
  return SecurityEventType.DATA_ACCESS;
}

function sanitizeBody(body: any): any {
  if (!body || typeof body !== 'object') return body;
  
  const sanitized = { ...body };
  const sensitiveFields = ['password', 'token', 'secret', 'key', 'auth'];
  
  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }
  
  return sanitized;
}

function sanitizeHeaders(headers: any): any {
  const sanitized = { ...headers };
  const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key'];
  
  for (const header of sensitiveHeaders) {
    if (sanitized[header]) {
      sanitized[header] = '[REDACTED]';
    }
  }
  
  return sanitized;
}

interface AttackPattern {
  type: SecurityEventType;
  severity: SecuritySeverity;
  message: string;
  shouldBlock: boolean;
  evidence: any;
}

function detectAttackPatterns(path: string, body: any, query: any, headers: any): AttackPattern[] {
  const attacks: AttackPattern[] = [];
  
  // SQL Injection patterns
  const sqlPatterns = [
    /(\b(union|select|insert|update|delete|drop|exec|script)\b)/i,
    /['"];.*?--/i,
    /\b(or|and)\s+\d+\s*=\s*\d+/i
  ];
  
  // XSS patterns
  const xssPatterns = [
    /<script[\s\S]*?>[\s\S]*?<\/script>/i,
    /javascript:/i,
    /on\w+\s*=/i,
    /<iframe/i
  ];
  
  // Check all string values
  const checkStrings = [
    JSON.stringify(body),
    JSON.stringify(query),
    path
  ];
  
  for (const str of checkStrings) {
    if (!str) continue;
    
    // Check for SQL injection
    for (const pattern of sqlPatterns) {
      if (pattern.test(str)) {
        attacks.push({
          type: SecurityEventType.INJECTION_ATTEMPT,
          severity: SecuritySeverity.HIGH,
          message: 'SQL injection attempt detected',
          shouldBlock: true,
          evidence: { pattern: pattern.source, value: str.substring(0, 200) }
        });
      }
    }
    
    // Check for XSS
    for (const pattern of xssPatterns) {
      if (pattern.test(str)) {
        attacks.push({
          type: SecurityEventType.XSS_ATTEMPT,
          severity: SecuritySeverity.HIGH,
          message: 'XSS attempt detected',
          shouldBlock: true,
          evidence: { pattern: pattern.source, value: str.substring(0, 200) }
        });
      }
    }
  }
  
  // Check for suspicious headers
  const userAgent = headers['user-agent'] || '';
  if (userAgent.includes('sqlmap') || userAgent.includes('nmap') || userAgent.includes('nikto')) {
    attacks.push({
      type: SecurityEventType.SUSPICIOUS_ACTIVITY,
      severity: SecuritySeverity.HIGH,
      message: 'Suspicious user agent detected',
      shouldBlock: true,
      evidence: { userAgent }
    });
  }
  
  return attacks;
}

/**
 * P1-7: Initialize security monitoring system
 */
export function initializeSecurityMonitoring() {
  console.log('🔒 P1-7: Initializing comprehensive security monitoring system...');
  
  // Log initial state
  console.log('🔒 SECURITY MONITORING: Structured logging active');
  console.log('🔒 SECURITY MONITORING: Attack detection active');
  console.log('🔒 SECURITY MONITORING: Correlation ID tracking active');
  console.log('🔒 SECURITY MONITORING: Audit trail active');
  
  // Set up periodic metrics reporting
  setInterval(() => {
    const metrics = securityEventStore.getSecurityMetrics(1); // Last hour
    if (metrics.totalEvents > 0) {
      console.log(`📊 SECURITY METRICS (1h): ${metrics.totalEvents} events, ${metrics.criticalEvents} critical, ${metrics.blockedEvents} blocked`);
    }
  }, 3600000); // Every hour
  
  console.log('🔒 SECURITY MONITORING: System initialized successfully');
  
  return securityEventStore;
}