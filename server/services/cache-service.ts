import Redis from 'ioredis';

export class CacheService {
  private static instance: CacheService;
  private client: Redis | null = null;

  private constructor() {
    this.initClient();
  }

  private initClient() {
    try {
      // Use short timeouts so we don't hang the application if Redis is unavailable
      this.client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
        maxRetriesPerRequest: 3,
        connectTimeout: 10000,
        retryStrategy(times) {
          // Don't give up connecting to the remote cache, but cap the delay at 5 seconds
          if (times > 20) {
             console.warn(`[CACHE SERVICE] Redis retry attempt ${times}...`);
          }
          return Math.min(times * 200, 5000);
        }
      });

      this.client.on('connect', () => {
        console.log('[CACHE SERVICE] Redis connected successfully.');
      });

      this.client.on('error', (err) => {
        console.warn('[CACHE SERVICE] Redis error:', err.message);
      });
    } catch (error) {
      console.warn('[CACHE SERVICE] Failed to initialize Redis client.');
    }
  }

  public static getInstance(): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService();
    }
    return CacheService.instance;
  }

  /**
   * Attempt to retrieve parsed JSON data from the cache.
   * Returns null if not found, or if cache is unavailable.
   */
  public async get<T>(key: string): Promise<T | null> {
    if (!this.client) return null;

    try {
      const data = await this.client.get(key);
      if (data) {
        // Universal debug log so the user can easily verify cache performance
        console.log(`[CACHE] ✅ HIT for key: ${key}`);
        return JSON.parse(data) as T;
      }
      return null;
    } catch (error) {
      console.warn(`[Cache] Warning: Failed to parse or fetch data for key ${key}:`, error);
      return null; // Graceful degradation
    }
  }

  /**
   * Attempt to store data in the cache with a TTL (in seconds).
   * Fails silently if cache is unavailable.
   */
  public async set(key: string, value: any, ttlSeconds: number = 3600): Promise<void> {
    if (!this.client) return;

    try {
      const stringValue = JSON.stringify(value);
      await this.client.set(key, stringValue, 'EX', ttlSeconds);
    } catch (error) {
      console.warn(`[CACHE SERVICE] Failed to SET key ${key}:`, error);
    }
  }

  /**
   * Invalidate a specific key.
   */
  public async invalidate(key: string): Promise<void> {
    if (!this.client) return;

    try {
      await this.client.del(key);
    } catch (error) {
      console.warn(`[CACHE SERVICE] Failed to INVALIDATE key ${key}:`, error);
    }
  }
}
