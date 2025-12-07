/**
 * P5: Performance & Scalability - Main Integration Module
 * 
 * Comprehensive performance optimization system integrating caching, database optimization,
 * static asset optimization, response compression, and background job optimization
 */

import { Express, Request, Response, NextFunction } from 'express';
import { 
  initializeCachingSystem, 
  CachingSystem, 
  cacheMiddleware 
} from './caching-system';
import { 
  initializeDatabaseOptimization, 
  DatabaseOptimizer, 
  databaseOptimizationMiddleware 
} from './database-optimization';
import { 
  initializeStaticOptimization, 
  StaticOptimizer, 
  staticOptimizationMiddleware 
} from './static-optimization';
import { 
  initializeResponseOptimization, 
  ResponseOptimizer, 
  responseOptimizationMiddleware 
} from './response-optimization';
import { 
  initializeBackgroundJobOptimization, 
  BackgroundJobOptimizer 
} from './background-optimization';
import { logger, StructuredLogger } from '../monitoring/structured-logger';

/**
 * P5: Initialize complete performance and scalability system
 */
export async function initializePerformanceSystem(app: Express): Promise<void> {
  console.log('🚀 P5: Initializing Performance & Scalability System...');

  try {
    // P5-1: Initialize caching system
    await initializeCachingSystem();

    // P5-2: Initialize database optimization
    initializeDatabaseOptimization();

    // P5-3: Initialize static asset optimization
    initializeStaticOptimization();

    // P5-4: Initialize response optimization
    initializeResponseOptimization();

    // P5-5: Initialize background job optimization
    initializeBackgroundJobOptimization();

    logger.info({
      event: 'P5_SYSTEM_INITIALIZED',
      components: [
        'Redis Caching System with Fallback',
        'Database Query Optimization & Monitoring',
        'Static Asset Optimization & CDN Ready',
        'Response Compression & Streaming',
        'Background Job Queue Optimization'
      ],
      timestamp: new Date().toISOString()
    }, '🔐 P5: Performance & Scalability system ready for production');

  } catch (error) {
    logger.error({
      event: 'P5_INITIALIZATION_ERROR',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, '❌ P5: Performance system initialization failed');
    throw error;
  }
}

/**
 * P5: Apply performance middleware to Express app
 */
export function applyPerformanceMiddleware(app: Express): void {
  // Apply performance middleware in optimal order
  app.use(databaseOptimizationMiddleware());
  app.use(cacheMiddleware(300, ['api_response'])); // 5 min default cache
  app.use(staticOptimizationMiddleware());
  app.use(responseOptimizationMiddleware());

  logger.info({
    event: 'PERFORMANCE_MIDDLEWARE_APPLIED',
    middleware: [
      'Database query monitoring',
      'Response caching',
      'Static asset optimization',
      'Response compression'
    ]
  }, '🔐 P5: Performance middleware applied');
}

/**
 * P5: Create performance monitoring API endpoints
 */
export function createPerformanceEndpoints(app: Express): void {
  // Cache statistics endpoint
  app.get('/api/performance/cache', (req: Request, res: Response) => {
    try {
      const stats = CachingSystem.getStats();
      res.json({
        timestamp: new Date().toISOString(),
        cache: stats
      });
      
      StructuredLogger.apiCall(
        'GET',
        '/api/performance/cache',
        200,
        0,
        req.correlationId
      );
    } catch (error) {
      logger.error({
        event: 'CACHE_STATS_ENDPOINT_ERROR',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      res.status(500).json({ error: 'Failed to get cache statistics' });
    }
  });

  // Database performance endpoint
  app.get('/api/performance/database', async (req: Request, res: Response) => {
    try {
      const stats = DatabaseOptimizer.getPerformanceStats();
      const health = await DatabaseOptimizer.checkDatabaseHealth();
      const recommendations = DatabaseOptimizer.getOptimizationRecommendations();
      
      res.json({
        timestamp: new Date().toISOString(),
        database: {
          stats,
          health,
          recommendations
        }
      });
      
      StructuredLogger.apiCall(
        'GET',
        '/api/performance/database',
        200,
        0,
        req.correlationId
      );
    } catch (error) {
      logger.error({
        event: 'DATABASE_STATS_ENDPOINT_ERROR',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      res.status(500).json({ error: 'Failed to get database statistics' });
    }
  });

  // Static asset performance endpoint
  app.get('/api/performance/static', (req: Request, res: Response) => {
    try {
      const stats = StaticOptimizer.getStats();
      const recommendations = StaticOptimizer.getOptimizationRecommendations();
      
      res.json({
        timestamp: new Date().toISOString(),
        static: {
          stats,
          recommendations
        }
      });
      
      StructuredLogger.apiCall(
        'GET',
        '/api/performance/static',
        200,
        0,
        req.correlationId
      );
    } catch (error) {
      logger.error({
        event: 'STATIC_STATS_ENDPOINT_ERROR',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      res.status(500).json({ error: 'Failed to get static asset statistics' });
    }
  });

  // Response optimization endpoint
  app.get('/api/performance/response', (req: Request, res: Response) => {
    try {
      const stats = ResponseOptimizer.getStats();
      const recommendations = ResponseOptimizer.getOptimizationRecommendations();
      
      res.json({
        timestamp: new Date().toISOString(),
        response: {
          stats,
          recommendations
        }
      });
      
      StructuredLogger.apiCall(
        'GET',
        '/api/performance/response',
        200,
        0,
        req.correlationId
      );
    } catch (error) {
      logger.error({
        event: 'RESPONSE_STATS_ENDPOINT_ERROR',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      res.status(500).json({ error: 'Failed to get response statistics' });
    }
  });

  // Background job performance endpoint
  app.get('/api/performance/jobs', (req: Request, res: Response) => {
    try {
      const stats = BackgroundJobOptimizer.getStats();
      const recommendations = BackgroundJobOptimizer.getOptimizationRecommendations();
      
      res.json({
        timestamp: new Date().toISOString(),
        jobs: {
          stats,
          recommendations
        }
      });
      
      StructuredLogger.apiCall(
        'GET',
        '/api/performance/jobs',
        200,
        0,
        req.correlationId
      );
    } catch (error) {
      logger.error({
        event: 'JOBS_STATS_ENDPOINT_ERROR',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      res.status(500).json({ error: 'Failed to get job statistics' });
    }
  });

  // Comprehensive performance overview endpoint
  app.get('/api/performance/overview', async (req: Request, res: Response) => {
    try {
      const overview = {
        timestamp: new Date().toISOString(),
        cache: CachingSystem.getStats(),
        database: {
          stats: DatabaseOptimizer.getPerformanceStats(),
          health: await DatabaseOptimizer.checkDatabaseHealth()
        },
        static: StaticOptimizer.getStats(),
        response: ResponseOptimizer.getStats(),
        jobs: BackgroundJobOptimizer.getStats()
      };
      
      res.json(overview);
      
      StructuredLogger.apiCall(
        'GET',
        '/api/performance/overview',
        200,
        0,
        req.correlationId
      );
    } catch (error) {
      logger.error({
        event: 'PERFORMANCE_OVERVIEW_ERROR',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      res.status(500).json({ error: 'Failed to get performance overview' });
    }
  });

  logger.info({
    event: 'PERFORMANCE_ENDPOINTS_CREATED',
    endpoints: [
      '/api/performance/cache',
      '/api/performance/database', 
      '/api/performance/static',
      '/api/performance/response',
      '/api/performance/jobs',
      '/api/performance/overview'
    ]
  }, '🔐 P5: Performance monitoring API endpoints created');
}

/**
 * P5: Cached route helpers for common endpoints
 */
export function applyCachedRoutes(app: Express): void {
  // Cache dashboard analytics with workspace-specific invalidation
  app.get('/api/dashboard/analytics', cacheMiddleware(180, ['dashboard']), (req: Request, res: Response, next: NextFunction) => {
    const cacheKey = `dashboard:${req.query.workspaceId}`;
    
    req.cache.get(cacheKey).then((cached: any) => {
      if (cached) {
        res.json(cached);
        return;
      }
      next();
    }).catch(() => next());
  });

  // Cache social accounts with workspace-specific invalidation
  app.get('/api/social-accounts', cacheMiddleware(600, ['social_accounts']), (req: Request, res: Response, next: NextFunction) => {
    const cacheKey = `social_accounts:${req.query.workspaceId}`;
    
    req.cache.get(cacheKey).then((cached: any) => {
      if (cached) {
        res.json(cached);
        return;
      }
      next();
    }).catch(() => next());
  });

  // Cache historical analytics
  app.get('/api/analytics/historical', cacheMiddleware(1800, ['historical']), (req: Request, res: Response, next: NextFunction) => {
    const cacheKey = `historical:${req.query.workspaceId}:${req.query.period}:${req.query.days}`;
    
    req.cache.get(cacheKey).then((cached: any) => {
      if (cached) {
        res.json(cached);
        return;
      }
      next();
    }).catch(() => next());
  });

  logger.info({
    event: 'CACHED_ROUTES_APPLIED',
    routes: [
      '/api/dashboard/analytics (3min)',
      '/api/social-accounts (10min)',
      '/api/analytics/historical (30min)'
    ]
  }, '🔐 P5: Cached routes configured for optimal performance');
}

/**
 * P5: Performance optimization startup tasks
 */
export async function performStartupOptimizations(): Promise<void> {
  try {
    // Warm up frequently accessed caches
    await CachingSystem.warmCache();

    // Analyze database performance
    const dbAnalysis = await DatabaseOptimizer.analyzeIndexUsage();
    if (dbAnalysis.suggestedIndexes.length > 0) {
      logger.info({
        event: 'DATABASE_INDEX_SUGGESTIONS',
        suggestions: dbAnalysis.suggestedIndexes.length
      }, `📊 Found ${dbAnalysis.suggestedIndexes.length} database index suggestions`);
    }

    logger.info({
      event: 'STARTUP_OPTIMIZATIONS_COMPLETED'
    }, '✅ P5: Startup performance optimizations completed');

  } catch (error) {
    logger.warn({
      event: 'STARTUP_OPTIMIZATIONS_WARNING',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, '⚠️ P5: Some startup optimizations failed but system is operational');
  }
}

// Re-export key components for external use
export { CachingSystem } from './caching-system';
export { DatabaseOptimizer } from './database-optimization';
export { StaticOptimizer } from './static-optimization';
export { ResponseOptimizer } from './response-optimization';
export { BackgroundJobOptimizer } from './background-optimization';

/**
 * P5: Graceful shutdown for performance systems
 */
export async function shutdownPerformanceSystems(): Promise<void> {
  logger.info({
    event: 'PERFORMANCE_SHUTDOWN_STARTED'
  }, '🔄 P5: Shutting down performance systems gracefully...');

  try {
    // Shutdown background job system
    await BackgroundJobOptimizer.shutdown();

    logger.info({
      event: 'PERFORMANCE_SHUTDOWN_COMPLETE'
    }, '✅ P5: Performance systems shutdown completed');

  } catch (error) {
    logger.error({
      event: 'PERFORMANCE_SHUTDOWN_ERROR',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, '❌ P5: Error during performance systems shutdown');
  }
}