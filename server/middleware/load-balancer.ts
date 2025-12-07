/**
 * P9-6: LOAD BALANCER & HIGH AVAILABILITY CONFIGURATION
 * Enterprise load balancing and session management for production deployments
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

interface LoadBalancerConfig {
  enableStickySessions: boolean;
  sessionAffinityHeader: string;
  healthCheckEndpoints: string[];
  maxRequestsPerMinute: number;
  circuitBreakerThreshold: number;
  retryAttempts: number;
  timeoutMs: number;
}

// Enterprise load balancer configuration
const LB_CONFIG: LoadBalancerConfig = {
  enableStickySessions: true,
  sessionAffinityHeader: 'X-Session-Affinity',
  healthCheckEndpoints: ['/health', '/health/ready', '/health/live'],
  maxRequestsPerMinute: 1000,
  circuitBreakerThreshold: 5, // Failed requests before opening circuit
  retryAttempts: 3,
  timeoutMs: 30000
};

/**
 * Session affinity middleware for sticky sessions
 */
export function sessionAffinityMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!LB_CONFIG.enableStickySessions) {
      return next();
    }

    let sessionId = req.headers[LB_CONFIG.sessionAffinityHeader.toLowerCase()] as string;
    
    // Generate session ID if not present
    if (!sessionId) {
      sessionId = crypto.randomBytes(16).toString('hex');
      
      // Set cookie for client-side session tracking
      res.cookie('session-affinity', sessionId, {
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
      });
      
      console.log(`🔄 P9: Generated new session affinity ID: ${sessionId.substring(0, 8)}...`);
    }

    // Set response header for load balancer
    res.setHeader(LB_CONFIG.sessionAffinityHeader, sessionId);
    
    // Add to request for downstream middleware
    req.sessionAffinityId = sessionId;

    next();
  };
}

/**
 * Load balancer health check middleware
 */
export function loadBalancerHealthMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Handle load balancer health check requests
    if (LB_CONFIG.healthCheckEndpoints.includes(req.path)) {
      const healthData = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        nodeId: process.env.NODE_ID || 'node-1',
        version: '1.0.0',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        loadAverage: process.platform === 'linux' ? require('os').loadavg() : null
      };

      // Add custom headers for load balancer
      res.setHeader('X-Health-Check', 'pass');
      res.setHeader('X-Node-ID', healthData.nodeId);
      res.setHeader('X-Uptime', healthData.uptime.toString());
      
      return res.json(healthData);
    }

    next();
  };
}

/**
 * Request rate limiting for load balancer protection
 */
export class LoadBalancerRateLimiter {
  private static requestCounts = new Map<string, { count: number; resetTime: number }>();

  public static middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const clientId = this.getClientIdentifier(req);
      const now = Date.now();
      const windowMs = 60 * 1000; // 1 minute window
      
      let clientData = this.requestCounts.get(clientId);
      
      if (!clientData || now > clientData.resetTime) {
        clientData = {
          count: 0,
          resetTime: now + windowMs
        };
      }

      clientData.count++;
      this.requestCounts.set(clientId, clientData);

      // Check if limit exceeded
      if (clientData.count > LB_CONFIG.maxRequestsPerMinute) {
        res.setHeader('X-RateLimit-Limit', LB_CONFIG.maxRequestsPerMinute.toString());
        res.setHeader('X-RateLimit-Remaining', '0');
        res.setHeader('X-RateLimit-Reset', clientData.resetTime.toString());
        res.setHeader('Retry-After', Math.ceil((clientData.resetTime - now) / 1000).toString());
        
        console.log(`🚫 P9: Rate limit exceeded for client: ${clientId.substring(0, 8)}...`);
        
        return res.status(429).json({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded. Please try again later.',
          retryAfter: Math.ceil((clientData.resetTime - now) / 1000)
        });
      }

      // Add rate limit headers
      res.setHeader('X-RateLimit-Limit', LB_CONFIG.maxRequestsPerMinute.toString());
      res.setHeader('X-RateLimit-Remaining', (LB_CONFIG.maxRequestsPerMinute - clientData.count).toString());
      res.setHeader('X-RateLimit-Reset', clientData.resetTime.toString());

      next();
    };
  }

  private static getClientIdentifier(req: Request): string {
    // Use session affinity ID if available, otherwise fall back to IP
    const sessionId = req.sessionAffinityId;
    if (sessionId) return sessionId;
    
    return req.ip || req.socket.remoteAddress || 'unknown';
  }

  public static cleanup(): void {
    const now = Date.now();
    for (const [clientId, data] of this.requestCounts.entries()) {
      if (now > data.resetTime) {
        this.requestCounts.delete(clientId);
      }
    }
  }
}

/**
 * Circuit breaker for downstream service protection
 */
export class CircuitBreaker {
  private static failures = new Map<string, { count: number; lastFailure: number; state: 'closed' | 'open' | 'half-open' }>();
  private static readonly RECOVERY_TIMEOUT = 30000; // 30 seconds

  public static middleware(serviceName: string) {
    return (req: Request, res: Response, next: NextFunction) => {
      const state = this.getState(serviceName);
      
      if (state === 'open') {
        console.log(`🚫 P9: Circuit breaker OPEN for ${serviceName}`);
        return res.status(503).json({
          error: 'Service Unavailable',
          message: 'Circuit breaker is open. Service temporarily unavailable.',
          service: serviceName
        });
      }

      // Add error handler to track failures
      const originalJson = res.json.bind(res);
      res.json = (data: any) => {
        if (res.statusCode >= 500) {
          this.recordFailure(serviceName);
        } else {
          this.recordSuccess(serviceName);
        }
        return originalJson(data);
      };

      // Add timeout handling
      const timeout = setTimeout(() => {
        if (!res.headersSent) {
          this.recordFailure(serviceName);
          res.status(504).json({
            error: 'Gateway Timeout',
            message: 'Request timeout',
            service: serviceName
          });
        }
      }, LB_CONFIG.timeoutMs);

      res.on('finish', () => {
        clearTimeout(timeout);
      });

      next();
    };
  }

  private static getState(serviceName: string): 'closed' | 'open' | 'half-open' {
    const failure = this.failures.get(serviceName);
    if (!failure) return 'closed';

    const now = Date.now();
    
    if (failure.state === 'open' && now - failure.lastFailure > this.RECOVERY_TIMEOUT) {
      failure.state = 'half-open';
      console.log(`🔄 P9: Circuit breaker HALF-OPEN for ${serviceName}`);
    }

    return failure.state;
  }

  private static recordFailure(serviceName: string): void {
    let failure = this.failures.get(serviceName);
    if (!failure) {
      failure = { count: 0, lastFailure: 0, state: 'closed' };
    }

    failure.count++;
    failure.lastFailure = Date.now();

    if (failure.count >= LB_CONFIG.circuitBreakerThreshold && failure.state !== 'open') {
      failure.state = 'open';
      console.log(`🚨 P9: Circuit breaker OPENED for ${serviceName} (${failure.count} failures)`);
    }

    this.failures.set(serviceName, failure);
  }

  private static recordSuccess(serviceName: string): void {
    const failure = this.failures.get(serviceName);
    if (failure) {
      if (failure.state === 'half-open') {
        failure.state = 'closed';
        failure.count = 0;
        console.log(`✅ P9: Circuit breaker CLOSED for ${serviceName}`);
      } else if (failure.state === 'closed') {
        failure.count = Math.max(0, failure.count - 1);
      }
      this.failures.set(serviceName, failure);
    }
  }

  public static getStatus(): Record<string, any> {
    const status: Record<string, any> = {};
    for (const [service, failure] of this.failures.entries()) {
      status[service] = {
        state: failure.state,
        failures: failure.count,
        lastFailure: new Date(failure.lastFailure).toISOString()
      };
    }
    return status;
  }
}

/**
 * Load balancer configuration headers
 */
export function loadBalancerHeadersMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Add headers for load balancer identification
    res.setHeader('X-Served-By', process.env.NODE_ID || 'node-1');
    res.setHeader('X-Load-Balancer', 'enterprise-v1');
    res.setHeader('X-Response-Time', Date.now().toString());
    
    // Add CORS headers for load balancer scenarios
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    }

    next();
  };
}

/**
 * Cleanup function for load balancer resources
 */
export function cleanupLoadBalancerResources(): void {
  console.log('🧹 P9: Cleaning up load balancer resources...');
  
  LoadBalancerRateLimiter.cleanup();
  
  // Clear old circuit breaker states
  const now = Date.now();
  for (const [service, failure] of CircuitBreaker['failures'].entries()) {
    if (now - failure.lastFailure > 300000) { // 5 minutes
      CircuitBreaker['failures'].delete(service);
    }
  }
  
  console.log('✅ P9: Load balancer cleanup completed');
}

// Schedule periodic cleanup
setInterval(cleanupLoadBalancerResources, 60000); // Every minute