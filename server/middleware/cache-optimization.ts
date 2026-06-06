/**
 * P9-5: ENTERPRISE CACHE OPTIMIZATION
 * Advanced caching strategies for high-availability production environments
 */

import { Request, Response, NextFunction } from 'express';

interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
  hits: number;
  lastAccessed: number;
}

interface CacheConfig {
  maxSize: number;
  defaultTTL: number;
  checkPeriod: number;
  enableCompression: boolean;
  enableStatistics: boolean;
}

// Enterprise cache configuration
const CACHE_CONFIG: CacheConfig = {
  maxSize: 1000,           // Maximum number of cache entries
  defaultTTL: 300000,      // 5 minutes default TTL
  checkPeriod: 60000,      // Check for expired entries every minute
  enableCompression: true,  // Enable data compression for large objects
  enableStatistics: true   // Enable cache performance statistics
};

export class EnterpriseCache {
  private static instance: EnterpriseCache;
  private cache = new Map<string, CacheEntry>();
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    totalSize: 0,
    avgResponseTime: 0,
    hitRate: 0
  };

  private constructor() {
    this.startMaintenanceTimer();
  }

  public static getInstance(): EnterpriseCache {
    if (!EnterpriseCache.instance) {
      EnterpriseCache.instance = new EnterpriseCache();
    }
    return EnterpriseCache.instance;
  }

  /**
   * Set cache entry with TTL and metadata
   */
  public set(key: string, data: any, ttl?: number): void {
    const now = Date.now();
    const entryTTL = ttl || CACHE_CONFIG.defaultTTL;

    // Compress data if enabled and data is large
    let processedData = data;
    if (CACHE_CONFIG.enableCompression && this.shouldCompress(data)) {
      processedData = this.compress(data);
    }

    const entry: CacheEntry = {
      data: processedData,
      timestamp: now,
      ttl: entryTTL,
      hits: 0,
      lastAccessed: now
    };

    // Evict oldest entries if cache is full
    if (this.cache.size >= CACHE_CONFIG.maxSize) {
      this.evictLRU();
    }

    this.cache.set(key, entry);
    this.updateStats();

    console.log(`📦 P9: Cached key: ${key} (TTL: ${entryTTL}ms, Size: ${this.cache.size})`);
  }

  /**
   * Get cache entry with hit tracking
   */
  public get(key: string): any | null {
    const entry = this.cache.get(key);
    const now = Date.now();

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if entry has expired
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.stats.misses++;
      this.stats.evictions++;
      return null;
    }

    // Update access metadata
    entry.hits++;
    entry.lastAccessed = now;
    this.stats.hits++;

    // Decompress data if needed
    let data = entry.data;
    if (this.isCompressed(data)) {
      data = this.decompress(data);
    }

    this.updateStats();
    return data;
  }

  /**
   * Delete cache entry
   */
  public delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.updateStats();
    }
    return deleted;
  }

  /**
   * Clear all cache entries
   */
  public clear(): void {
    this.cache.clear();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      totalSize: 0,
      avgResponseTime: 0,
      hitRate: 0
    };
    console.log('🧹 P9: Cache cleared');
  }

  /**
   * Get cache statistics
   */
  public getStats(): typeof this.stats & {
    totalEntries: number;
    oldestEntry?: string;
    newestEntry?: string;
    mostAccessed?: string;
  } {
    let oldestEntry: string | undefined;
    let newestEntry: string | undefined;
    let mostAccessed: string | undefined;
    let maxHits = 0;
    let oldestTime = Date.now();
    let newestTime = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestEntry = key;
      }
      if (entry.timestamp > newestTime) {
        newestTime = entry.timestamp;
        newestEntry = key;
      }
      if (entry.hits > maxHits) {
        maxHits = entry.hits;
        mostAccessed = key;
      }
    }

    return {
      ...this.stats,
      totalEntries: this.cache.size,
      oldestEntry,
      newestEntry,
      mostAccessed
    };
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let lruKey: string | undefined;
    let lruTime = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < lruTime) {
        lruTime = entry.lastAccessed;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
      this.stats.evictions++;
      console.log(`🗑️ P9: Evicted LRU cache entry: ${lruKey}`);
    }
  }

  /**
   * Update cache statistics
   */
  private updateStats(): void {
    if (!CACHE_CONFIG.enableStatistics) return;

    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;
    this.stats.totalSize = this.cache.size;
  }

  private maintenanceTimer: NodeJS.Timeout | null = null;

  /**
   * Periodic maintenance - remove expired entries
   */
  private startMaintenanceTimer(): void {
    if (this.maintenanceTimer) {
      clearInterval(this.maintenanceTimer);
    }
    
    this.maintenanceTimer = setInterval(() => {
      const now = Date.now();
      let expired = 0;

      for (const [key, entry] of this.cache.entries()) {
        if (now - entry.timestamp > entry.ttl) {
          this.cache.delete(key);
          expired++;
          this.stats.evictions++;
        }
      }

      if (expired > 0) {
        console.log(`🧹 P9: Cleaned up ${expired} expired cache entries`);
        this.updateStats();
      }
    }, CACHE_CONFIG.checkPeriod);

    // Make sure we don't leak on hot reloads
    const stopMaintenanceTimer = () => {
      if (this.maintenanceTimer) clearInterval(this.maintenanceTimer);
    };
    process.once('SIGTERM', stopMaintenanceTimer);
    process.once('SIGINT', stopMaintenanceTimer);
  }

  /**
   * Determine if data should be compressed
   */
  private shouldCompress(data: any): boolean {
    const serialized = JSON.stringify(data);
    return serialized.length > 1024; // Compress objects > 1KB
  }

  /**
   * Simple compression implementation
   */
  private compress(data: any): { compressed: true; data: string } {
    return {
      compressed: true,
      data: JSON.stringify(data) // In production, use actual compression like gzip
    };
  }

  /**
   * Check if data is compressed
   */
  private isCompressed(data: any): boolean {
    return data && typeof data === 'object' && data.compressed === true;
  }

  /**
   * Decompress data
   */
  private decompress(compressedData: { compressed: true; data: string }): any {
    return JSON.parse(compressedData.data);
  }
}

// Singleton instance
export const enterpriseCache = EnterpriseCache.getInstance();

/**
 * Enterprise cache middleware factory
 */
export function cacheMiddleware(options?: {
  ttl?: number;
  keyGenerator?: (req: Request) => string;
  skipIf?: (req: Request) => boolean;
}) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Default key generator
    const generateKey = options?.keyGenerator || ((req: Request) => {
      const userId = req.user ? (req.user as any).id || (req.user as any).uid || 'anon' : 'anon';
      const workspaceId = req.workspaceId || req.query.workspaceId || 'no-workspace';
      return `${req.method}:${req.originalUrl}:${JSON.stringify(req.query)}:user:${userId}:ws:${workspaceId}`;
    });

    // Check if caching should be skipped
    if (options?.skipIf && options.skipIf(req)) {
      return next();
    }

    const cacheKey = generateKey(req);
    const cachedResponse = enterpriseCache.get(cacheKey);

    if (cachedResponse) {
      console.log(`⚡ P9: Cache HIT for ${cacheKey}`);
      return res.json(cachedResponse);
    }

    // Override res.json to cache the response
    const originalJson = res.json.bind(res);
    res.json = function(data: any) {
      // Only cache successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        enterpriseCache.set(cacheKey, data, options?.ttl);
        console.log(`💾 P9: Cache MISS - stored ${cacheKey}`);
      }
      return originalJson(data);
    };

    next();
  };
}

/**
 * Cache warming for critical endpoints (Disabled to prevent SSRF and unauthenticated internal requests)
 */
export class CacheWarmer {
  public static async warmCache(baseUrl = 'http://localhost:5000'): Promise<void> {
    console.log('🔥 P9: Cache warming disabled for security (SSRF/Unauthenticated fetch prevention)');
  }
}

/**
 * Cache optimization middleware for static assets
 */
export function staticCacheMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Set cache headers for static assets
    if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|otf)$/)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); // 1 year
      // ETag with Date.now() defeats caching. Removed.
    } else if (req.path.match(/\.(json|xml)$/)) {
      res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour
    } else {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }

    next();
  };
}