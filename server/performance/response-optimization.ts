/**
 * P5-4: Response Compression & Optimization
 * 
 * Production-grade response optimization with intelligent compression,
 * content encoding, response streaming, and performance monitoring
 */

import { Request, Response, NextFunction } from 'express';
import { logger, StructuredLogger } from '../monitoring/structured-logger';
import { MetricsCollector } from '../monitoring/metrics-collector';
import * as zlib from 'zlib';

/**
 * P5-4.1: Response optimization configuration
 */
interface CompressionConfig {
  enabled: boolean;
  level: number; // 1-9, higher = better compression but slower
  threshold: number; // minimum size to compress
  algorithm: 'gzip' | 'deflate' | 'br';
  quality: number; // brotli quality (0-11)
  memLevel: number; // memory usage level (1-9)
}

interface OptimizationStats {
  totalResponses: number;
  compressedResponses: number;
  originalBytes: number;
  compressedBytes: number;
  compressionTime: number;
  averageCompressionRatio: number;
}

/**
 * P5-4.2: Response optimization system
 */
export class ResponseOptimizer {
  private static config: CompressionConfig = {
    enabled: true,
    level: 6, // Balanced compression
    threshold: 1024, // 1KB minimum
    algorithm: 'gzip',
    quality: 4, // Brotli quality
    memLevel: 8 // High memory for better compression
  };

  private static stats: OptimizationStats = {
    totalResponses: 0,
    compressedResponses: 0,
    originalBytes: 0,
    compressedBytes: 0,
    compressionTime: 0,
    averageCompressionRatio: 0
  };

  private static compressionSupport = new Map<string, boolean>();

  /**
   * P5-4.2a: Initialize response optimization
   */
  static initialize(config?: Partial<CompressionConfig>): void {
    this.config = { ...this.config, ...config };

    // Detect available compression algorithms
    this.detectCompressionSupport();

    logger.info({
      event: 'RESPONSE_OPTIMIZER_INITIALIZED',
      config: this.config,
      supportedAlgorithms: Array.from(this.compressionSupport.entries())
    }, '🔐 P5-4: Response optimization system initialized');
  }

  /**
   * P5-4.2b: Detect compression algorithm support
   */
  private static detectCompressionSupport(): void {
    try {
      // Test gzip
      zlib.gzipSync(Buffer.from('test'));
      this.compressionSupport.set('gzip', true);
    } catch {
      this.compressionSupport.set('gzip', false);
    }

    try {
      // Test deflate
      zlib.deflateSync(Buffer.from('test'));
      this.compressionSupport.set('deflate', true);
    } catch {
      this.compressionSupport.set('deflate', false);
    }

    try {
      // Test brotli
      zlib.brotliCompressSync(Buffer.from('test'));
      this.compressionSupport.set('br', true);
    } catch {
      this.compressionSupport.set('br', false);
    }
  }

  /**
   * P5-4.2c: Determine best compression algorithm for client
   */
  static getBestCompressionAlgorithm(acceptEncoding: string): string | null {
    if (!this.config.enabled || !acceptEncoding) return null;

    const clientSupports = acceptEncoding.toLowerCase();
    
    // Prefer brotli for best compression, then gzip, then deflate
    if (clientSupports.includes('br') && this.compressionSupport.get('br')) {
      return 'br';
    } else if (clientSupports.includes('gzip') && this.compressionSupport.get('gzip')) {
      return 'gzip';
    } else if (clientSupports.includes('deflate') && this.compressionSupport.get('deflate')) {
      return 'deflate';
    }

    return null;
  }

  /**
   * P5-4.2d: Check if content should be compressed
   */
  static shouldCompress(
    contentType: string,
    contentLength: number,
    userAgent?: string
  ): boolean {
    if (!this.config.enabled || contentLength < this.config.threshold) {
      return false;
    }

    // Don't compress already compressed content
    const compressedTypes = [
      'image/', 'video/', 'audio/', 'application/zip', 'application/gzip',
      'application/x-rar', 'application/x-7z', 'application/pdf'
    ];
    
    if (compressedTypes.some(type => contentType.includes(type))) {
      return false;
    }

    // Don't compress for very old browsers that have compression issues
    if (userAgent && (
      userAgent.includes('MSIE 6') || 
      userAgent.includes('MSIE 5') ||
      userAgent.includes('MSIE 4')
    )) {
      return false;
    }

    // Compress text content
    const compressibleTypes = [
      'text/', 'application/json', 'application/javascript',
      'application/xml', 'application/x-javascript', 'application/atom+xml',
      'application/rss+xml', 'application/xhtml+xml'
    ];

    return compressibleTypes.some(type => contentType.includes(type));
  }

  /**
   * P5-4.2e: Compress response data
   */
  static async compressResponse(
    data: Buffer | string,
    algorithm: 'gzip' | 'deflate' | 'br',
    correlationId?: string
  ): Promise<Buffer> {
    const startTime = Date.now();
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    
    try {
      let compressed: Buffer;

      switch (algorithm) {
        case 'br':
          compressed = await new Promise<Buffer>((resolve, reject) => {
            zlib.brotliCompress(buffer, {
              params: {
                [zlib.constants.BROTLI_PARAM_QUALITY]: this.config.quality,
                [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buffer.length
              }
            }, (err, result) => {
              if (err) reject(err);
              else resolve(result);
            });
          });
          break;

        case 'gzip':
          compressed = await new Promise<Buffer>((resolve, reject) => {
            zlib.gzip(buffer, {
              level: this.config.level,
              memLevel: this.config.memLevel
            }, (err, result) => {
              if (err) reject(err);
              else resolve(result);
            });
          });
          break;

        case 'deflate':
          compressed = await new Promise<Buffer>((resolve, reject) => {
            zlib.deflate(buffer, {
              level: this.config.level,
              memLevel: this.config.memLevel
            }, (err, result) => {
              if (err) reject(err);
              else resolve(result);
            });
          });
          break;

        default:
          throw new Error(`Unsupported compression algorithm: ${algorithm}`);
      }

      const compressionTime = Date.now() - startTime;
      const originalSize = buffer.length;
      const compressedSize = compressed.length;
      const compressionRatio = ((originalSize - compressedSize) / originalSize) * 100;

      // Update statistics
      this.updateStats(originalSize, compressedSize, compressionTime, compressionRatio);

      // Log compression metrics
      StructuredLogger.metric(
        'response_compression',
        compressionRatio,
        'percent',
        {
          algorithm,
          original_size: originalSize.toString(),
          compressed_size: compressedSize.toString(),
          compression_time: compressionTime.toString()
        },
        correlationId
      );

      MetricsCollector.observeHistogram(
        'response_compression_ratio',
        compressionRatio / 100,
        { algorithm }
      );

      MetricsCollector.observeHistogram(
        'response_compression_time_seconds',
        compressionTime / 1000,
        { algorithm }
      );

      return compressed;

    } catch (error) {
      const compressionTime = Date.now() - startTime;
      
      logger.error({
        event: 'COMPRESSION_ERROR',
        algorithm,
        size: buffer.length,
        compressionTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId
      }, `❌ Compression failed for ${algorithm}`);

      // Return original data if compression fails
      return buffer;
    }
  }

  /**
   * P5-4.2f: Update compression statistics
   */
  private static updateStats(
    originalSize: number,
    compressedSize: number,
    compressionTime: number,
    compressionRatio: number
  ): void {
    this.stats.totalResponses++;
    this.stats.compressedResponses++;
    this.stats.originalBytes += originalSize;
    this.stats.compressedBytes += compressedSize;
    this.stats.compressionTime += compressionTime;
    
    // Update average compression ratio
    this.stats.averageCompressionRatio = 
      (this.stats.averageCompressionRatio * (this.stats.compressedResponses - 1) + compressionRatio) / 
      this.stats.compressedResponses;
  }

  /**
   * P5-4.3: Response streaming optimization
   */
  static createStreamingResponse(
    data: any,
    contentType: string = 'application/json'
  ): NodeJS.ReadableStream {
    const { Readable } = require('stream');
    
    let jsonData: string;
    if (typeof data === 'string') {
      jsonData = data;
    } else {
      jsonData = JSON.stringify(data);
    }

    const chunks = this.chunkData(jsonData, 8192); // 8KB chunks
    let index = 0;

    return new Readable({
      read() {
        if (index < chunks.length) {
          this.push(chunks[index]);
          index++;
        } else {
          this.push(null); // End of stream
        }
      }
    });
  }

  /**
   * P5-4.3a: Split data into chunks for streaming
   */
  private static chunkData(data: string, chunkSize: number): Buffer[] {
    const chunks: Buffer[] = [];
    const buffer = Buffer.from(data, 'utf8');
    
    for (let i = 0; i < buffer.length; i += chunkSize) {
      const end = Math.min(i + chunkSize, buffer.length);
      chunks.push(buffer.slice(i, end));
    }
    
    return chunks;
  }

  /**
   * P5-4.4: Response optimization recommendations
   */
  static getOptimizationRecommendations(): Array<{
    type: 'compression' | 'streaming' | 'caching' | 'optimization';
    priority: 'high' | 'medium' | 'low';
    description: string;
    impact: string;
    implementation: string;
  }> {
    const recommendations = [];
    
    // Check compression effectiveness
    if (this.stats.compressedResponses > 0 && this.stats.averageCompressionRatio < 20) {
      recommendations.push({
        type: 'compression',
        priority: 'medium',
        description: `Low compression ratio: ${this.stats.averageCompressionRatio.toFixed(1)}%`,
        impact: 'Larger response sizes and slower page loads',
        implementation: 'Review content types and compression settings'
      });
    }

    // Check compression usage
    const compressionUsage = this.stats.totalResponses > 0 
      ? (this.stats.compressedResponses / this.stats.totalResponses) * 100 
      : 0;
    
    if (compressionUsage < 50) {
      recommendations.push({
        type: 'compression',
        priority: 'high',
        description: `Low compression usage: ${compressionUsage.toFixed(1)}%`,
        impact: 'Missing bandwidth savings and performance gains',
        implementation: 'Enable compression for more content types'
      });
    }

    // Check average compression time
    const avgCompressionTime = this.stats.compressedResponses > 0 
      ? this.stats.compressionTime / this.stats.compressedResponses 
      : 0;
    
    if (avgCompressionTime > 50) {
      recommendations.push({
        type: 'compression',
        priority: 'medium',
        description: `Slow compression: ${avgCompressionTime.toFixed(1)}ms average`,
        impact: 'Increased response times',
        implementation: 'Reduce compression level or switch algorithm'
      });
    }

    // Large response size recommendation
    const avgResponseSize = this.stats.totalResponses > 0 
      ? this.stats.originalBytes / this.stats.totalResponses 
      : 0;
    
    if (avgResponseSize > 100000) { // 100KB
      recommendations.push({
        type: 'streaming',
        priority: 'high',
        description: `Large average response size: ${(avgResponseSize / 1024).toFixed(1)}KB`,
        impact: 'Slow initial page loads and high memory usage',
        implementation: 'Implement response streaming and pagination'
      });
    }

    return recommendations;
  }

  /**
   * P5-4.5: Get comprehensive statistics
   */
  static getStats(): OptimizationStats & {
    compressionUsage: number;
    bandwidthSaved: number;
    averageCompressionTime: number;
  } {
    const compressionUsage = this.stats.totalResponses > 0 
      ? (this.stats.compressedResponses / this.stats.totalResponses) * 100 
      : 0;
    
    const bandwidthSaved = this.stats.originalBytes - this.stats.compressedBytes;
    
    const averageCompressionTime = this.stats.compressedResponses > 0 
      ? this.stats.compressionTime / this.stats.compressedResponses 
      : 0;

    return {
      ...this.stats,
      compressionUsage: Math.round(compressionUsage * 100) / 100,
      bandwidthSaved,
      averageCompressionTime: Math.round(averageCompressionTime * 100) / 100
    };
  }

  /**
   * P5-4.6: Reset statistics (for testing)
   */
  static resetStats(): void {
    this.stats = {
      totalResponses: 0,
      compressedResponses: 0,
      originalBytes: 0,
      compressedBytes: 0,
      compressionTime: 0,
      averageCompressionRatio: 0
    };
  }
}

/**
 * P5-4.7: Response optimization middleware
 */
export function responseOptimizationMiddleware() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const originalSend = res.send;
    const originalJson = res.json;

    // Override send to add compression
    res.send = async function(data: any) {
      const acceptEncoding = req.get('Accept-Encoding') || '';
      const userAgent = req.get('User-Agent') || '';
      const contentType = res.get('Content-Type') || 'text/html';
      
      let responseData = data;
      let shouldCompress = false;
      
      if (typeof data === 'string' || Buffer.isBuffer(data)) {
        const contentLength = Buffer.isBuffer(data) ? data.length : Buffer.byteLength(data, 'utf8');
        
        shouldCompress = ResponseOptimizer.shouldCompress(
          contentType,
          contentLength,
          userAgent
        );

        if (shouldCompress) {
          const algorithm = ResponseOptimizer.getBestCompressionAlgorithm(acceptEncoding);
          
          if (algorithm) {
            try {
              responseData = await ResponseOptimizer.compressResponse(
                data,
                algorithm,
                req.correlationId
              );
              
              res.set('Content-Encoding', algorithm);
              res.set('Vary', 'Accept-Encoding');
              
              // Remove content-length as it will be different after compression
              res.removeHeader('Content-Length');
            } catch (error) {
              logger.warn({
                event: 'COMPRESSION_FALLBACK',
                error: error instanceof Error ? error.message : 'Unknown error',
                correlationId: req.correlationId
              }, '⚠️ Compression failed, sending uncompressed response');
            }
          }
        }
      }

      // Track response statistics
      ResponseOptimizer.stats.totalResponses++;
      if (!shouldCompress) {
        const size = Buffer.isBuffer(data) ? data.length : Buffer.byteLength(data, 'utf8');
        ResponseOptimizer.stats.originalBytes += size;
        ResponseOptimizer.stats.compressedBytes += size;
      }

      return originalSend.call(this, responseData);
    };

    // Override json to add compression for JSON responses
    res.json = async function(data: any) {
      res.set('Content-Type', 'application/json; charset=utf-8');
      const jsonString = JSON.stringify(data);
      return res.send(jsonString);
    };

    next();
  };
}

/**
 * P5-4.8: Initialize response optimization system
 */
export function initializeResponseOptimization(): void {
  ResponseOptimizer.initialize();

  // Setup periodic statistics collection
  setInterval(() => {
    const stats = ResponseOptimizer.getStats();
    
    // Record metrics
    MetricsCollector.setGauge('response_compression_usage_percent', stats.compressionUsage);
    MetricsCollector.setGauge('response_compression_ratio_percent', stats.averageCompressionRatio);
    MetricsCollector.setGauge('response_bandwidth_saved_bytes', stats.bandwidthSaved);
    MetricsCollector.setGauge('response_compression_time_ms', stats.averageCompressionTime);
    
    // Log performance summary
    if (stats.totalResponses > 0) {
      logger.info({
        event: 'RESPONSE_OPTIMIZATION_SUMMARY',
        stats
      }, `📊 Response optimization: ${stats.compressionUsage.toFixed(1)}% compressed, ${(stats.bandwidthSaved / 1024).toFixed(1)}KB saved`);
    }
  }, 300000); // Every 5 minutes

  // Setup weekly optimization analysis
  setInterval(() => {
    const recommendations = ResponseOptimizer.getOptimizationRecommendations();
    
    if (recommendations.length > 0) {
      logger.info({
        event: 'RESPONSE_OPTIMIZATION_RECOMMENDATIONS',
        recommendationCount: recommendations.length,
        highPriority: recommendations.filter(r => r.priority === 'high').length
      }, '📈 Response optimization recommendations available');
      
      recommendations.forEach(rec => {
        if (rec.priority === 'high') {
          logger.warn({
            event: 'HIGH_PRIORITY_RESPONSE_RECOMMENDATION',
            recommendation: rec
          }, `⚠️ ${rec.description}`);
        }
      });
    }
  }, 7 * 24 * 60 * 60 * 1000); // Weekly

  logger.info({
    event: 'RESPONSE_OPTIMIZATION_INITIALIZED',
    features: [
      'Intelligent content compression (gzip, deflate, brotli)',
      'Dynamic algorithm selection',
      'Response streaming capabilities',
      'Compression performance monitoring',
      'Bandwidth usage tracking',
      'Optimization recommendations',
      'Content-type aware compression'
    ]
  }, '🔐 P5-4: Response optimization system ready for production');
}