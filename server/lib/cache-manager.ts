import Redis from 'ioredis';

interface CacheOptions {
  ttl?: number; // Time to live in seconds
  prefix?: string;
}

export class CacheManager {
  private redis: Redis;
  private defaultTTL = 300; // 5 minutes

  constructor(redisClient: Redis) {
    this.redis = redisClient;
  }

  async get<T>(key: string, prefix = 'cache'): Promise<T | null> {
    try {
      const fullKey = `${prefix}:${key}`;
      const cached = await this.redis.get(fullKey);
      
      if (!cached) return null;
      
      return JSON.parse(cached) as T;
    } catch (error) {
      console.error('[CacheManager] Get error:', error);
      return null; // Fail gracefully
    }
  }

  async set(key: string, value: any, options: CacheOptions = {}): Promise<void> {
    try {
      const fullKey = `${options.prefix || 'cache'}:${key}`;
      const ttl = options.ttl || this.defaultTTL;
      
      await this.redis.setex(
        fullKey,
        ttl,
        JSON.stringify(value)
      );
    } catch (error) {
      console.error('[CacheManager] Set error:', error);
      // Fail gracefully - don't throw
    }
  }

  async delete(key: string, prefix = 'cache'): Promise<void> {
    try {
      const fullKey = `${prefix}:${key}`;
      await this.redis.del(fullKey);
    } catch (error) {
      console.error('[CacheManager] Delete error:', error);
    }
  }

  async invalidatePattern(pattern: string, prefix = 'cache'): Promise<void> {
    try {
      const fullPattern = `${prefix}:${pattern}`;
      const keys = await this.redis.keys(fullPattern);
      
      if (keys.length > 0) {
        await this.redis.del(...keys);
        console.log(`[CacheManager] Invalidated ${keys.length} keys matching ${fullPattern}`);
      }
    } catch (error) {
      console.error('[CacheManager] Invalidate pattern error:', error);
    }
  }
}

// Export singleton instance
let cacheManager: CacheManager | null = null;

export function initializeCacheManager(redisClient: Redis): CacheManager {
  cacheManager = new CacheManager(redisClient);
  console.log('[CACHE] Cache manager initialized');
  return cacheManager;
}

export function getCacheManager(): CacheManager | null {
  return cacheManager;
}
