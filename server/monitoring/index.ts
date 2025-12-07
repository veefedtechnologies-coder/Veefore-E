/**
 * P4: Reliability & Observability - Main Integration Module
 * 
 * Comprehensive production monitoring system integrating structured logging,
 * health endpoints, metrics collection, error tracking, and feature flags
 */

import { Express, Request, Response } from 'express';
import { 
  initializeStructuredLogging, 
  correlationMiddleware, 
  logger, 
  StructuredLogger 
} from './structured-logger';
import { registerHealthEndpoints } from './health-endpoints';
import { 
  initializeMetricsSystem, 
  metricsMiddleware, 
  MetricsCollector 
} from './metrics-collector';
import { 
  initializeErrorTracking, 
  errorTrackingMiddleware 
} from './error-tracking';
import { 
  initializeFeatureFlagSystem, 
  featureFlagMiddleware 
} from './feature-flags';

/**
 * P4: Initialize complete reliability and observability system
 */
export function initializeReliabilitySystem(app: Express): void {
  console.log('🔐 P4: Initializing Reliability & Observability System...');

  // P4-1: Initialize structured logging
  initializeStructuredLogging();

  // P4-2: Register health endpoints
  registerHealthEndpoints(app);

  // P4-3: Initialize metrics collection
  initializeMetricsSystem();

  // P4-4: Initialize error tracking
  initializeErrorTracking();

  // P4-5: Initialize feature flags
  initializeFeatureFlagSystem();

  logger.info({
    event: 'P4_SYSTEM_INITIALIZED',
    components: [
      'Structured Logging with Correlation IDs',
      'Health Endpoints (/healthz, /readyz, /health)',
      'Prometheus-compatible Metrics Collection',
      'Error Tracking with PII Scrubbing',
      'Feature Flags with Rollout Controls'
    ],
    timestamp: new Date().toISOString()
  }, '🔐 P4: Reliability & Observability system ready for production');
}

/**
 * P4: Apply monitoring middleware to Express app
 */
export function applyMonitoringMiddleware(app: Express): void {
  // Apply monitoring middleware in correct order
  app.use(correlationMiddleware());
  app.use(metricsMiddleware());
  app.use(featureFlagMiddleware());
  
  // Error tracking middleware should be applied last (after routes)
  // This will be called separately after route registration

  logger.info({
    event: 'MONITORING_MIDDLEWARE_APPLIED',
    middleware: [
      'Correlation ID tracking',
      'Metrics collection',
      'Feature flag evaluation'
    ]
  }, '🔐 P4: Monitoring middleware applied');
}

/**
 * P4: Apply error tracking middleware (call after routes)
 */
export function applyErrorTrackingMiddleware(app: Express): void {
  app.use(errorTrackingMiddleware());
  
  logger.info({
    event: 'ERROR_TRACKING_MIDDLEWARE_APPLIED'
  }, '🔐 P4: Error tracking middleware applied');
}

/**
 * P4: Create monitoring API endpoints
 */
export function createMonitoringEndpoints(app: Express): void {
  // Metrics endpoint (Prometheus format)
  app.get('/metrics', (req: Request, res: Response) => {
    try {
      const metrics = MetricsCollector.exportPrometheusMetrics();
      res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      res.send(metrics);
      
      StructuredLogger.apiCall(
        'GET',
        '/metrics',
        200,
        0,
        req.correlationId
      );
    } catch (error) {
      logger.error({
        event: 'METRICS_ENDPOINT_ERROR',
        error: error instanceof Error ? error.message : 'Unknown error'
      }, '❌ Metrics endpoint error');
      res.status(500).json({ error: 'Failed to export metrics' });
    }
  });

  // Metrics endpoint (JSON format)
  app.get('/metrics.json', (req: Request, res: Response) => {
    try {
      const metrics = MetricsCollector.exportJSONMetrics();
      res.json(metrics);
      
      StructuredLogger.apiCall(
        'GET',
        '/metrics.json',
        200,
        0,
        req.correlationId
      );
    } catch (error) {
      logger.error({
        event: 'METRICS_JSON_ENDPOINT_ERROR',
        error: error instanceof Error ? error.message : 'Unknown error'
      }, '❌ Metrics JSON endpoint error');
      res.status(500).json({ error: 'Failed to export metrics' });
    }
  });

  // System information endpoint
  app.get('/system/info', (req: Request, res: Response) => {
    try {
      const systemInfo = {
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        nodeVersion: process.version,
        platform: process.platform,
        architecture: process.arch,
        memory: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
        metrics: MetricsCollector.getSummary()
      };

      res.json(systemInfo);
      
      StructuredLogger.apiCall(
        'GET',
        '/system/info',
        200,
        0,
        req.correlationId
      );
    } catch (error) {
      logger.error({
        event: 'SYSTEM_INFO_ENDPOINT_ERROR',
        error: error instanceof Error ? error.message : 'Unknown error'
      }, '❌ System info endpoint error');
      res.status(500).json({ error: 'Failed to get system information' });
    }
  });

  logger.info({
    event: 'MONITORING_ENDPOINTS_CREATED',
    endpoints: ['/metrics', '/metrics.json', '/system/info']
  }, '🔐 P4: Monitoring API endpoints created');
}

/**
 * P4: Record deployment/startup metrics
 */
export function recordStartupMetrics(): void {
  // Record deployment timestamp
  MetricsCollector.setGauge(
    'application_deployment_timestamp',
    Date.now(),
    { version: process.env.npm_package_version || '1.0.0' },
    'Application deployment timestamp'
  );

  // Record initial system metrics
  MetricsCollector.recordSystemMetrics();

  // Record startup event
  StructuredLogger.metric(
    'application_startup',
    1,
    'event',
    {
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development'
    }
  );

  logger.info({
    event: 'STARTUP_METRICS_RECORDED',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  }, '📊 P4: Startup metrics recorded');
}

// Re-export key components for external use
export { 
  logger, 
  StructuredLogger
} from './structured-logger';
export { MetricsCollector } from './metrics-collector';
export { ErrorTracker } from './error-tracking';
export { FeatureFlagManager, FeatureFlags } from './feature-flags';

/**
 * P4: Graceful shutdown handler
 */
export function setupGracefulShutdown(): void {
  const shutdown = (signal: string) => {
    logger.info({
      event: 'GRACEFUL_SHUTDOWN_STARTED',
      signal,
      uptime: process.uptime()
    }, `🔄 P4: Graceful shutdown initiated (${signal})`);

    // Record shutdown metrics
    MetricsCollector.setGauge(
      'application_shutdown_timestamp',
      Date.now(),
      { signal },
      'Application shutdown timestamp'
    );

    // Give time for final logs to be processed
    setTimeout(() => {
      logger.info({
        event: 'GRACEFUL_SHUTDOWN_COMPLETE'
      }, '✅ P4: Graceful shutdown complete');
      process.exit(0);
    }, 1000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  logger.info({
    event: 'GRACEFUL_SHUTDOWN_HANDLERS_SETUP'
  }, '🔐 P4: Graceful shutdown handlers configured');
}