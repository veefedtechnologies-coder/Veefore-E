/**
 * P4-2: Health Endpoints (/healthz, /readyz)
 * 
 * Production-grade health checking endpoints for container orchestration,
 * load balancers, and monitoring systems with comprehensive system validation
 */

import { Request, Response } from 'express';
import { logger, StructuredLogger } from './structured-logger';

/**
 * P4-2.1: Health check interface
 */
interface HealthCheck {
  name: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  message?: string;
  responseTime: number;
  metadata?: Record<string, any>;
}

interface HealthResponse {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  checks: HealthCheck[];
  summary: {
    total: number;
    healthy: number;
    unhealthy: number;
    degraded: number;
  };
}

/**
 * P4-2.2: Individual health checks
 */
export class HealthChecks {
  /**
   * Check MongoDB connection
   */
  static async checkMongoDB(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      // Import mongoose dynamically to avoid circular dependencies
      const mongooseMod = await import('mongoose');
      const mongoose = mongooseMod.default || (mongooseMod as any);
      
      if (mongoose.connection.readyState !== 1) {
        return {
          name: 'mongodb',
          status: 'unhealthy',
          message: 'MongoDB connection not established',
          responseTime: Date.now() - startTime
        };
      }

      // Test with a simple ping
      await mongoose.connection.db.admin().ping();
      
      return {
        name: 'mongodb',
        status: 'healthy',
        message: 'MongoDB connection active',
        responseTime: Date.now() - startTime,
        metadata: {
          readyState: mongoose.connection.readyState,
          host: mongoose.connection.host,
          name: mongoose.connection.name
        }
      };
    } catch (error) {
      return {
        name: 'mongodb',
        status: 'unhealthy',
        message: `MongoDB error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        responseTime: Date.now() - startTime
      };
    }
  }

  /**
   * Check Redis connection
   */
  static async checkRedis(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      // Check if Redis is available (optional dependency)
      if (!process.env.REDIS_URL) {
        return {
          name: 'redis',
          status: 'degraded',
          message: 'Redis not configured (optional)',
          responseTime: Date.now() - startTime
        };
      }

      // Import redis dynamically
      const redisMod = await import('redis');
      const createClient = (redisMod as any).createClient;
      const client = createClient({ url: process.env.REDIS_URL });
      
      await client.connect();
      await client.ping();
      await client.disconnect();
      
      return {
        name: 'redis',
        status: 'healthy',
        message: 'Redis connection successful',
        responseTime: Date.now() - startTime
      };
    } catch (error) {
      return {
        name: 'redis',
        status: 'unhealthy',
        message: `Redis error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        responseTime: Date.now() - startTime
      };
    }
  }

  /**
   * Check file system access
   */
  static async checkFileSystem(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      const fsMod = await import('fs');
      const fs = (fsMod as any).promises;
      const pathMod = await import('path');
      const path = pathMod.default || (pathMod as any);
      
      // Test write/read/delete in temp directory
      const testFile = path.join(process.cwd(), 'temp-health-check.txt');
      const testContent = `health-check-${Date.now()}`;
      
      await fs.writeFile(testFile, testContent);
      const content = await fs.readFile(testFile, 'utf8');
      await fs.unlink(testFile);
      
      if (content !== testContent) {
        throw new Error('File content mismatch');
      }
      
      return {
        name: 'filesystem',
        status: 'healthy',
        message: 'File system read/write successful',
        responseTime: Date.now() - startTime
      };
    } catch (error) {
      return {
        name: 'filesystem',
        status: 'unhealthy',
        message: `File system error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        responseTime: Date.now() - startTime
      };
    }
  }

  /**
   * Check memory usage
   */
  static async checkMemory(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      const memUsage = process.memoryUsage();
      const totalMemMB = Math.round(memUsage.rss / 1024 / 1024);
      const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
      const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
      
      // Consider unhealthy if using more than 1GB total or heap usage > 80%
      const isUnhealthy = totalMemMB > 1024 || (heapUsedMB / heapTotalMB) > 0.8;
      const isDegraded = totalMemMB > 512 || (heapUsedMB / heapTotalMB) > 0.6;
      
      let status: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';
      let message = 'Memory usage normal';
      
      if (isUnhealthy) {
        status = 'unhealthy';
        message = 'High memory usage detected';
      } else if (isDegraded) {
        status = 'degraded';
        message = 'Elevated memory usage';
      }
      
      return {
        name: 'memory',
        status,
        message,
        responseTime: Date.now() - startTime,
        metadata: {
          totalMB: totalMemMB,
          heapUsedMB,
          heapTotalMB,
          heapUsagePercent: Math.round((heapUsedMB / heapTotalMB) * 100)
        }
      };
    } catch (error) {
      return {
        name: 'memory',
        status: 'unhealthy',
        message: `Memory check error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        responseTime: Date.now() - startTime
      };
    }
  }

  /**
   * Check external API connectivity
   */
  static async checkExternalAPIs(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      // Test basic internet connectivity with a lightweight request
      const httpsMod = await import('https');
      const https = httpsMod.default || (httpsMod as any);
      
      return new Promise<HealthCheck>((resolve) => {
        const req = https.get('https://httpbin.org/status/200', { timeout: 5000 }, (res: any) => {
          if (res.statusCode === 200) {
            resolve({
              name: 'external_apis',
              status: 'healthy',
              message: 'External API connectivity verified',
              responseTime: Date.now() - startTime
            });
          } else {
            resolve({
              name: 'external_apis',
              status: 'degraded',
              message: `Unexpected status code: ${res.statusCode}`,
              responseTime: Date.now() - startTime
            });
          }
        });
        
        req.on('error', () => {
          resolve({
            name: 'external_apis',
            status: 'unhealthy',
            message: 'External API connectivity failed',
            responseTime: Date.now() - startTime
          });
        });
        
        req.on('timeout', () => {
          req.destroy();
          resolve({
            name: 'external_apis',
            status: 'unhealthy',
            message: 'External API connectivity timeout',
            responseTime: Date.now() - startTime
          });
        });
      });
    } catch (error) {
      return {
        name: 'external_apis',
        status: 'unhealthy',
        message: `External API check error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        responseTime: Date.now() - startTime
      };
    }
  }
}

/**
 * P4-2.3: Health endpoint implementation
 */
export class HealthEndpoints {
  private static startTime = Date.now();

  /**
   * Liveness probe - basic health check
   * Returns 200 if the application is running
   */
  static async healthz(req: Request, res: Response): Promise<void> {
    const timestamp = new Date().toISOString();
    const uptime = Math.floor((Date.now() - HealthEndpoints.startTime) / 1000);
    
    // Basic checks for liveness
    const checks: HealthCheck[] = [
      await HealthChecks.checkMemory(),
      await HealthChecks.checkFileSystem()
    ];
    
    const summary = {
      total: checks.length,
      healthy: checks.filter(c => c.status === 'healthy').length,
      unhealthy: checks.filter(c => c.status === 'unhealthy').length,
      degraded: checks.filter(c => c.status === 'degraded').length
    };
    
    // Determine overall status
    const hasUnhealthy = summary.unhealthy > 0;
    const overallStatus = hasUnhealthy ? 'unhealthy' : 'healthy';
    
    const response: HealthResponse = {
      status: overallStatus,
      timestamp,
      uptime,
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      checks,
      summary
    };
    
    // Log health check
    StructuredLogger.metric(
      'health_check_liveness',
      hasUnhealthy ? 0 : 1,
      'boolean',
      { endpoint: '/healthz' },
      req.correlationId
    );
    
    res.status(hasUnhealthy ? 503 : 200).json(response);
  }

  /**
   * Readiness probe - comprehensive health check
   * Returns 200 if the application is ready to serve traffic
   */
  static async readyz(req: Request, res: Response): Promise<void> {
    const timestamp = new Date().toISOString();
    const uptime = Math.floor((Date.now() - HealthEndpoints.startTime) / 1000);
    
    // Comprehensive checks for readiness
    const checks: HealthCheck[] = await Promise.all([
      HealthChecks.checkMongoDB(),
      HealthChecks.checkRedis(),
      HealthChecks.checkFileSystem(),
      HealthChecks.checkMemory(),
      HealthChecks.checkExternalAPIs()
    ]);
    
    const summary = {
      total: checks.length,
      healthy: checks.filter(c => c.status === 'healthy').length,
      unhealthy: checks.filter(c => c.status === 'unhealthy').length,
      degraded: checks.filter(c => c.status === 'degraded').length
    };
    
    // Determine overall status - degraded services don't make us unready
    const hasUnhealthy = summary.unhealthy > 0;
    const overallStatus = hasUnhealthy ? 'unhealthy' : 
                         summary.degraded > 0 ? 'degraded' : 'healthy';
    
    const response: HealthResponse = {
      status: overallStatus,
      timestamp,
      uptime,
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      checks,
      summary
    };
    
    // Log health check
    StructuredLogger.metric(
      'health_check_readiness',
      hasUnhealthy ? 0 : 1,
      'boolean',
      { 
        endpoint: '/readyz',
        degraded_services: summary.degraded.toString()
      },
      req.correlationId
    );
    
    // Return 503 only for unhealthy, not degraded
    res.status(hasUnhealthy ? 503 : 200).json(response);
  }

  /**
   * Detailed health check with all information
   */
  static async health(req: Request, res: Response): Promise<void> {
    const timestamp = new Date().toISOString();
    const uptime = Math.floor((Date.now() - HealthEndpoints.startTime) / 1000);
    
    // All available checks
    const checks: HealthCheck[] = await Promise.all([
      HealthChecks.checkMongoDB(),
      HealthChecks.checkRedis(),
      HealthChecks.checkFileSystem(),
      HealthChecks.checkMemory(),
      HealthChecks.checkExternalAPIs()
    ]);
    
    const summary = {
      total: checks.length,
      healthy: checks.filter(c => c.status === 'healthy').length,
      unhealthy: checks.filter(c => c.status === 'unhealthy').length,
      degraded: checks.filter(c => c.status === 'degraded').length
    };
    
    const hasUnhealthy = summary.unhealthy > 0;
    const overallStatus = hasUnhealthy ? 'unhealthy' : 
                         summary.degraded > 0 ? 'degraded' : 'healthy';
    
    const response: HealthResponse = {
      status: overallStatus,
      timestamp,
      uptime,
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      checks,
      summary
    };
    
    // Always return 200 for the detailed endpoint
    res.json(response);
  }
}

/**
 * P4-2.4: Register health endpoints
 */
export function registerHealthEndpoints(app: any): void {
  // Kubernetes-style health probes
  app.get('/healthz', HealthEndpoints.healthz);
  app.get('/readyz', HealthEndpoints.readyz);
  
  // Detailed health information
  app.get('/health', HealthEndpoints.health);
  
  logger.info({
    event: 'HEALTH_ENDPOINTS_REGISTERED',
    endpoints: ['/healthz', '/readyz', '/health'],
    description: 'Production health monitoring endpoints ready'
  }, '🔐 P4-2: Health endpoints registered for production monitoring');
}
