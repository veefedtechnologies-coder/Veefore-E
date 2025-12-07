/**
 * P5-3: Static Asset Optimization & CDN Integration
 * 
 * Production-grade static asset optimization with CDN integration,
 * compression, caching headers, and performance monitoring
 */

import { Request, Response, NextFunction } from 'express';
import { logger, StructuredLogger } from '../monitoring/structured-logger';
import { MetricsCollector } from '../monitoring/metrics-collector';
import * as path from 'path';
import * as fs from 'fs';

/**
 * P5-3.1: Static asset configuration
 */
interface AssetConfig {
  enableCompression: boolean;
  enableCaching: boolean;
  cdnEnabled: boolean;
  cdnBaseUrl?: string;
  cacheMaxAge: number;
  staticMaxAge: number;
  etagEnabled: boolean;
}

interface AssetStats {
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  totalBytes: number;
  compressedBytes: number;
  averageResponseTime: number;
}

/**
 * P5-3.2: Static asset optimization system
 */
export class StaticOptimizer {
  private static config: AssetConfig = {
    enableCompression: true,
    enableCaching: true,
    cdnEnabled: false,
    cacheMaxAge: 31536000, // 1 year for static assets
    staticMaxAge: 86400, // 1 day for dynamic content
    etagEnabled: true
  };

  private static stats: AssetStats = {
    totalRequests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    totalBytes: 0,
    compressedBytes: 0,
    averageResponseTime: 0
  };

  private static compressionRatios = new Map<string, number>();

  /**
   * P5-3.2a: Initialize static optimization
   */
  static initialize(config?: Partial<AssetConfig>): void {
    this.config = { ...this.config, ...config };

    // Setup CDN if configured
    if (process.env.CDN_BASE_URL) {
      this.config.cdnEnabled = true;
      this.config.cdnBaseUrl = process.env.CDN_BASE_URL;
    }

    logger.info({
      event: 'STATIC_OPTIMIZER_INITIALIZED',
      config: this.config
    }, '🔐 P5-3: Static asset optimization system initialized');
  }

  /**
   * P5-3.2b: Generate optimized asset URLs
   */
  static getAssetUrl(assetPath: string, version?: string): string {
    try {
      // Remove leading slash
      const cleanPath = assetPath.startsWith('/') ? assetPath.slice(1) : assetPath;
      
      if (this.config.cdnEnabled && this.config.cdnBaseUrl) {
        // Use CDN for production
        const versionedPath = version ? `${cleanPath}?v=${version}` : cleanPath;
        return `${this.config.cdnBaseUrl}/${versionedPath}`;
      } else {
        // Use local serving for development
        const versionedPath = version ? `/${cleanPath}?v=${version}` : `/${cleanPath}`;
        return versionedPath;
      }
    } catch (error) {
      logger.error({
        event: 'ASSET_URL_GENERATION_ERROR',
        assetPath,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return assetPath;
    }
  }

  /**
   * P5-3.2c: Get appropriate cache headers
   */
  static getCacheHeaders(filePath: string, isStatic: boolean = true): Record<string, string> {
    const headers: Record<string, string> = {};
    
    try {
      const ext = path.extname(filePath).toLowerCase();
      const maxAge = isStatic ? this.config.cacheMaxAge : this.config.staticMaxAge;
      
      if (this.config.enableCaching) {
        // Set cache control based on file type
        if (this.isVersionedAsset(filePath)) {
          // Immutable assets (versioned) - cache forever
          headers['Cache-Control'] = `public, max-age=${this.config.cacheMaxAge}, immutable`;
        } else if (this.isStaticAsset(ext)) {
          // Regular static assets - cache with validation
          headers['Cache-Control'] = `public, max-age=${maxAge}`;
        } else {
          // Dynamic content - short cache with validation
          headers['Cache-Control'] = `public, max-age=${this.config.staticMaxAge}, must-revalidate`;
        }

        // Add ETag for cache validation
        if (this.config.etagEnabled && fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          headers['ETag'] = `"${stats.mtime.getTime().toString(16)}-${stats.size.toString(16)}"`;
        }
      } else {
        headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
      }

      // Content type specific headers
      if (ext === '.js') {
        headers['Content-Type'] = 'application/javascript; charset=utf-8';
      } else if (ext === '.css') {
        headers['Content-Type'] = 'text/css; charset=utf-8';
      } else if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
        headers['Content-Type'] = `image/${ext.slice(1)}`;
      }

      return headers;

    } catch (error) {
      logger.error({
        event: 'CACHE_HEADERS_ERROR',
        filePath,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return { 'Cache-Control': 'no-cache' };
    }
  }

  /**
   * P5-3.2d: Check if asset is versioned (has hash/version in filename)
   */
  private static isVersionedAsset(filePath: string): boolean {
    const filename = path.basename(filePath);
    // Check for version hash patterns like app.abc123.js or bundle-abc123.css
    return /\.[a-f0-9]{6,}\.(js|css|woff2?|ttf|eot)$/i.test(filename) ||
           /-[a-f0-9]{6,}\.(js|css|woff2?|ttf|eot)$/i.test(filename);
  }

  /**
   * P5-3.2e: Check if file is a static asset
   */
  private static isStaticAsset(extension: string): boolean {
    const staticExtensions = [
      '.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp',
      '.woff', '.woff2', '.ttf', '.eot', '.ico', '.pdf', '.mp4', '.webm'
    ];
    return staticExtensions.includes(extension.toLowerCase());
  }

  /**
   * P5-3.3: Compression utilities
   */
  static shouldCompress(filePath: string, size: number): boolean {
    if (!this.config.enableCompression) return false;
    
    const ext = path.extname(filePath).toLowerCase();
    const compressibleTypes = ['.js', '.css', '.html', '.svg', '.json', '.xml', '.txt'];
    
    // Don't compress already compressed files or very small files
    const nonCompressibleTypes = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.webm', '.woff', '.woff2'];
    
    return compressibleTypes.includes(ext) && 
           !nonCompressibleTypes.includes(ext) && 
           size > 1024; // Only compress files larger than 1KB
  }

  /**
   * P5-3.4: Asset performance tracking
   */
  static trackAssetRequest(
    filePath: string,
    responseTime: number,
    originalSize: number,
    compressedSize?: number,
    cacheHit: boolean = false,
    correlationId?: string
  ): void {
    this.stats.totalRequests++;
    this.stats.totalBytes += originalSize;
    
    if (compressedSize !== undefined) {
      this.stats.compressedBytes += compressedSize;
      const compressionRatio = ((originalSize - compressedSize) / originalSize) * 100;
      this.compressionRatios.set(path.extname(filePath), compressionRatio);
    }

    if (cacheHit) {
      this.stats.cacheHits++;
    } else {
      this.stats.cacheMisses++;
    }

    // Update average response time
    this.stats.averageResponseTime = 
      (this.stats.averageResponseTime * (this.stats.totalRequests - 1) + responseTime) / 
      this.stats.totalRequests;

    // Record metrics
    MetricsCollector.observeHistogram(
      'static_asset_response_time_seconds',
      responseTime / 1000,
      { 
        file_type: path.extname(filePath) || 'unknown',
        cache_hit: cacheHit.toString(),
        compressed: compressedSize !== undefined ? 'true' : 'false'
      }
    );

    StructuredLogger.metric(
      'static_asset_request',
      1,
      'count',
      {
        file_path: filePath,
        file_size: originalSize.toString(),
        response_time: responseTime.toString(),
        cache_hit: cacheHit.toString()
      },
      correlationId
    );
  }

  /**
   * P5-3.5: Asset optimization recommendations
   */
  static getOptimizationRecommendations(): Array<{
    type: 'compression' | 'caching' | 'cdn' | 'optimization';
    priority: 'high' | 'medium' | 'low';
    description: string;
    impact: string;
    implementation: string;
  }> {
    const recommendations = [];
    
    // Check cache hit rate
    const cacheHitRate = this.stats.totalRequests > 0 
      ? (this.stats.cacheHits / this.stats.totalRequests) * 100 
      : 0;
    
    if (cacheHitRate < 70) {
      recommendations.push({
        type: 'caching',
        priority: 'high',
        description: `Low cache hit rate: ${cacheHitRate.toFixed(1)}%`,
        impact: 'Increased server load and slower page loads',
        implementation: 'Review cache headers and asset versioning strategy'
      });
    }

    // Check compression effectiveness
    const totalSaved = this.stats.totalBytes - this.stats.compressedBytes;
    const compressionRate = this.stats.totalBytes > 0 
      ? (totalSaved / this.stats.totalBytes) * 100 
      : 0;
    
    if (compressionRate < 30 && this.config.enableCompression) {
      recommendations.push({
        type: 'compression',
        priority: 'medium',
        description: `Low compression rate: ${compressionRate.toFixed(1)}%`,
        impact: 'Larger file sizes and slower downloads',
        implementation: 'Review compression settings and file types'
      });
    }

    // CDN recommendation
    if (!this.config.cdnEnabled && this.stats.totalRequests > 1000) {
      recommendations.push({
        type: 'cdn',
        priority: 'medium',
        description: 'High static asset traffic without CDN',
        impact: 'Increased server load and slower global performance',
        implementation: 'Configure CDN for static asset delivery'
      });
    }

    // Response time optimization
    if (this.stats.averageResponseTime > 100) {
      recommendations.push({
        type: 'optimization',
        priority: 'high',
        description: `Slow average response time: ${this.stats.averageResponseTime.toFixed(1)}ms`,
        impact: 'Poor user experience and page load times',
        implementation: 'Optimize asset sizes and enable better caching'
      });
    }

    return recommendations;
  }

  /**
   * P5-3.6: Get comprehensive statistics
   */
  static getStats(): AssetStats & {
    cacheHitRate: number;
    compressionRate: number;
    topCompressionRatios: Array<{ type: string; ratio: number }>;
  } {
    const cacheHitRate = this.stats.totalRequests > 0 
      ? (this.stats.cacheHits / this.stats.totalRequests) * 100 
      : 0;
    
    const compressionRate = this.stats.totalBytes > 0 
      ? ((this.stats.totalBytes - this.stats.compressedBytes) / this.stats.totalBytes) * 100 
      : 0;

    const topCompressionRatios = Array.from(this.compressionRatios.entries())
      .map(([type, ratio]) => ({ type, ratio }))
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, 5);

    return {
      ...this.stats,
      cacheHitRate: Math.round(cacheHitRate * 100) / 100,
      compressionRate: Math.round(compressionRate * 100) / 100,
      topCompressionRatios
    };
  }

  /**
   * P5-3.7: Reset statistics (for testing)
   */
  static resetStats(): void {
    this.stats = {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      totalBytes: 0,
      compressedBytes: 0,
      averageResponseTime: 0
    };
    this.compressionRatios.clear();
  }
}

/**
 * P5-3.8: Static optimization middleware
 */
export function staticOptimizationMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const originalSend = res.send;
    const originalJson = res.json;

    // Override send to track response
    res.send = function(data: any) {
      const responseTime = Date.now() - startTime;
      const size = Buffer.isBuffer(data) ? data.length : 
                   typeof data === 'string' ? Buffer.byteLength(data, 'utf8') : 0;

      // Check if this is a static asset request
      const isStaticAsset = StaticOptimizer['isStaticAsset'](path.extname(req.path));
      
      if (isStaticAsset) {
        const cacheHit = req.get('if-none-match') && res.get('etag') && 
                        req.get('if-none-match') === res.get('etag');
        
        StaticOptimizer.trackAssetRequest(
          req.path,
          responseTime,
          size,
          undefined,
          cacheHit,
          req.correlationId
        );
      }

      return originalSend.call(this, data);
    };

    // Override json to track API responses
    res.json = function(data: any) {
      const responseTime = Date.now() - startTime;
      const size = JSON.stringify(data).length;

      MetricsCollector.observeHistogram(
        'api_response_size_bytes',
        size,
        { 
          endpoint: req.route?.path || req.path,
          method: req.method
        }
      );

      return originalJson.call(this, data);
    };

    next();
  };
}

/**
 * P5-3.9: Initialize static optimization system
 */
export function initializeStaticOptimization(): void {
  StaticOptimizer.initialize();

  // Setup periodic statistics collection
  setInterval(() => {
    const stats = StaticOptimizer.getStats();
    
    // Record metrics
    MetricsCollector.setGauge('static_cache_hit_rate_percent', stats.cacheHitRate);
    MetricsCollector.setGauge('static_compression_rate_percent', stats.compressionRate);
    MetricsCollector.setGauge('static_avg_response_time_ms', stats.averageResponseTime);
    
    // Log performance summary
    if (stats.totalRequests > 0) {
      logger.info({
        event: 'STATIC_OPTIMIZATION_SUMMARY',
        stats
      }, `📊 Static assets: ${stats.cacheHitRate.toFixed(1)}% cache hit, ${stats.compressionRate.toFixed(1)}% compression`);
    }
  }, 300000); // Every 5 minutes

  // Setup weekly optimization analysis
  setInterval(() => {
    const recommendations = StaticOptimizer.getOptimizationRecommendations();
    
    if (recommendations.length > 0) {
      logger.info({
        event: 'STATIC_OPTIMIZATION_RECOMMENDATIONS',
        recommendationCount: recommendations.length,
        highPriority: recommendations.filter(r => r.priority === 'high').length
      }, '📈 Static asset optimization recommendations available');
      
      recommendations.forEach(rec => {
        if (rec.priority === 'high') {
          logger.warn({
            event: 'HIGH_PRIORITY_STATIC_RECOMMENDATION',
            recommendation: rec
          }, `⚠️ ${rec.description}`);
        }
      });
    }
  }, 7 * 24 * 60 * 60 * 1000); // Weekly

  logger.info({
    event: 'STATIC_OPTIMIZATION_INITIALIZED',
    features: [
      'Intelligent cache headers',
      'Asset versioning support',
      'CDN integration ready',
      'Compression optimization',
      'Performance monitoring',
      'Cache hit rate tracking',
      'Optimization recommendations'
    ]
  }, '🔐 P5-3: Static asset optimization system ready for production');
}