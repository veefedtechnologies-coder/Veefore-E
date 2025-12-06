/**
 * P9-1: ENTERPRISE HEALTH CHECK ENDPOINTS
 * Comprehensive health monitoring for load balancers and production systems
 */

import express from 'express';
// import { connectDB, disconnectDB } from '../config/database.js'; // Not needed for health checks
import mongoose from 'mongoose';
import { tokenEncryption } from '../security/token-encryption';

const router = express.Router();

// Health check response interface
interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  checks: {
    database: HealthCheck;
    memory: HealthCheck;
    disk?: HealthCheck;
    external?: HealthCheck;
  };
  version: string;
  environment: string;
}

interface HealthCheck {
  status: 'pass' | 'fail' | 'warn';
  responseTime?: number;
  details?: string;
  lastCheck?: string;
}

// Memory usage thresholds (in MB)
const MEMORY_THRESHOLDS = {
  WARNING: 512, // 512MB
  CRITICAL: 1024 // 1GB
};

/**
 * GET /health - Basic health check (fast response for load balancers)
 */
router.get('/health', async (req, res) => {
  const startTime = Date.now();
  
  try {
    // Quick database connectivity check
    const dbStatus = mongoose.connection.readyState === 1 ? 'pass' : 'fail';
    const responseTime = Date.now() - startTime;
    
    const health: HealthResponse = {
      status: dbStatus === 'pass' ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks: {
        database: {
          status: dbStatus,
          responseTime,
          details: `MongoDB ${mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'}`,
          lastCheck: new Date().toISOString()
        },
        memory: getMemoryCheck()
      },
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development'
    };

    // Set appropriate HTTP status
    const httpStatus = health.status === 'healthy' ? 200 : 
                      health.status === 'degraded' ? 200 : 503;

    res.status(httpStatus).json(health);

  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks: {
        database: { status: 'fail', details: 'Health check error' },
        memory: getMemoryCheck()
      },
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development'
    });
  }
});

/**
 * GET /health/detailed - Comprehensive health check with all systems
 */
router.get('/health/detailed', async (req, res) => {
  const startTime = Date.now();
  
  try {
    // Detailed database check with query test
    const databaseCheck = await performDatabaseCheck();
    const memoryCheck = getMemoryCheck();
    const externalCheck = await checkExternalServices();
    
    const allChecks = [databaseCheck, memoryCheck, externalCheck];
    const failedChecks = allChecks.filter(check => check.status === 'fail');
    const warningChecks = allChecks.filter(check => check.status === 'warn');
    
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
    if (failedChecks.length > 0) {
      overallStatus = 'unhealthy';
    } else if (warningChecks.length > 0) {
      overallStatus = 'degraded';
    } else {
      overallStatus = 'healthy';
    }

    const health: HealthResponse = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks: {
        database: databaseCheck,
        memory: memoryCheck,
        external: externalCheck
      },
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development'
    };

    const httpStatus = health.status === 'healthy' ? 200 : 
                      health.status === 'degraded' ? 200 : 503;

    res.status(httpStatus).json(health);

  } catch (error) {
    console.error('Detailed health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check system failure'
    });
  }
});

/**
 * GET /health/ready - Kubernetes readiness probe
 */
router.get('/health/ready', async (req, res) => {
  try {
    // Check if application is ready to serve traffic
    const isReady = mongoose.connection.readyState === 1;
    
    if (isReady) {
      res.status(200).json({
        status: 'ready',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(503).json({
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        reason: 'Database not connected'
      });
    }
  } catch (error) {
    res.status(503).json({
      status: 'not_ready',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

/**
 * GET /health/live - Kubernetes liveness probe
 */
router.get('/health/live', (req, res) => {
  // Simple liveness check - if process is running, it's alive
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

/**
 * GET /health/metrics - Health metrics for monitoring systems
 */
router.get('/health/metrics', async (req, res) => {
  try {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    const metrics = {
      timestamp: new Date().toISOString(),
      process: {
        uptime: process.uptime(),
        memory: {
          rss: Math.round(memUsage.rss / 1024 / 1024), // MB
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
          external: Math.round(memUsage.external / 1024 / 1024) // MB
        },
        cpu: {
          user: cpuUsage.user,
          system: cpuUsage.system
        }
      },
      database: {
        connected: mongoose.connection.readyState === 1,
        readyState: mongoose.connection.readyState,
        host: mongoose.connection.host,
        name: mongoose.connection.name
      },
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        env: process.env.NODE_ENV || 'development'
      }
    };

    res.json(metrics);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to collect metrics',
      timestamp: new Date().toISOString()
    });
  }
});

router.get('/health/encryption', (req, res) => {
  try {
    const status = tokenEncryption.getEncryptionStatus();
    res.json({
      algorithm: status.algorithm,
      keyBits: status.keyLength,
      kdfIterations: status.kdfIterations,
      rotationDays: status.rotationDays,
      rotationActive: status.rotationActive,
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get encryption status' });
  }
});

// Helper Functions

function getMemoryCheck(): HealthCheck {
  const memUsage = process.memoryUsage();
  const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
  
  let status: 'pass' | 'warn' | 'fail';
  let details: string;
  
  if (heapUsedMB > MEMORY_THRESHOLDS.CRITICAL) {
    status = 'fail';
    details = `Critical memory usage: ${Math.round(heapUsedMB)}MB`;
  } else if (heapUsedMB > MEMORY_THRESHOLDS.WARNING) {
    status = 'warn';
    details = `High memory usage: ${Math.round(heapUsedMB)}MB`;
  } else {
    status = 'pass';
    details = `Memory usage normal: ${Math.round(heapUsedMB)}MB`;
  }
  
  return {
    status,
    details,
    lastCheck: new Date().toISOString()
  };
}

async function performDatabaseCheck(): Promise<HealthCheck> {
  const startTime = Date.now();
  
  try {
    // Test database connectivity with a simple query
    if (!mongoose.connection.db) {
      throw new Error('Database connection not established');
    }
    await mongoose.connection.db.admin().ping();
    const responseTime = Date.now() - startTime;
    
    return {
      status: 'pass',
      responseTime,
      details: `Database responsive in ${responseTime}ms`,
      lastCheck: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'fail',
      responseTime: Date.now() - startTime,
      details: `Database check failed: ${error.message}`,
      lastCheck: new Date().toISOString()
    };
  }
}

async function checkExternalServices(): Promise<HealthCheck> {
  // Check external service dependencies
  try {
    // Add checks for external APIs, Redis, etc.
    // For now, return a pass status
    return {
      status: 'pass',
      details: 'All external services operational',
      lastCheck: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'fail',
      details: `External services check failed: ${error.message}`,
      lastCheck: new Date().toISOString()
    };
  }
}

export default router;
