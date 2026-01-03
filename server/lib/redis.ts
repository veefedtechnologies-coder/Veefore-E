import Redis from 'ioredis';

// Singleton Redis client instance
let redisClient: Redis | null = null;
let redisSubscriber: Redis | null = null;

export const getRedisClient = (): Redis => {
    if (!redisClient) {
        // Support standard REDIS_URL or Vercel's KV_URL / STORAGE_REDIS_URL
        const redisUrl = process.env.REDIS_URL ||
            process.env.KV_URL ||
            process.env.STORAGE_REDIS_URL;

        if (!redisUrl) {
            console.warn('[REDIS] REDIS_URL (or KV_URL) not set, falling back to localhost default');
        }

        console.log('[REDIS] Connecting to:', redisUrl ? 'External Redis (Vercel/Upstash)' : 'Localhost');

        redisClient = new Redis(redisUrl || 'redis://localhost:6379', {
            maxRetriesPerRequest: null, // Required for BullMQ
            enableReadyCheck: false,
            retryStrategy: (times) => {
                const delay = Math.min(times * 50, 2000);
                return delay;
            }
        });

        redisClient.on('error', (err) => {
            console.error('[REDIS] Client Error:', err);
        });

        redisClient.on('connect', () => {
            console.log('[REDIS] Client Connected');
        });
    }

    return redisClient;
};

// Create a separate connection for subscriptions (required by BullMQ/PubSub patterns)
export const getRedisSubscriber = (): Redis => {
    if (!redisSubscriber) {
        const redisUrl = process.env.REDIS_URL ||
            process.env.KV_URL ||
            process.env.STORAGE_REDIS_URL;

        redisSubscriber = new Redis(redisUrl || 'redis://localhost:6379', {
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
            retryStrategy: (times) => {
                const delay = Math.min(times * 50, 2000);
                return delay;
            }
        });

        redisSubscriber.on('error', (err) => {
            console.error('[REDIS] Subscriber Error:', err);
        });
    }

    return redisSubscriber;
};

// Create a separate connection for Rate Limiting (Fail-fast strategy)
// This ensures that if Redis is slow/down, the API doesn't hang but "fails open"
let rateLimitClient: Redis | null = null;

export const getRateLimitRedisClient = (): Redis => {
    if (!rateLimitClient) {
        const redisUrl = process.env.REDIS_URL ||
            process.env.KV_URL ||
            process.env.STORAGE_REDIS_URL;

        rateLimitClient = new Redis(redisUrl || 'redis://localhost:6379', {
            // Fail fast settings
            maxRetriesPerRequest: 1,       // Don't retry commands forever
            enableOfflineQueue: false,      // Don't queue commands if disconnected
            commandTimeout: 1000,           // 1s hard timeout on commands
            connectTimeout: 1000,           // 1s connection timeout
            enableReadyCheck: false,
            retryStrategy: (times) => {
                // Retry only a few times with short delay
                if (times > 3) return null; // Stop retrying after 3 attempts
                return Math.min(times * 50, 200);
            }
        });

        rateLimitClient.on('error', (err) => {
            // Suppress critical errors to prevent crash, just log warning
            // The rate limiter middleware handles these errors by failing open
            console.warn('[REDIS-RL] Client Error (Fail-safe):', err.message);
        });

        rateLimitClient.on('connect', () => {
            console.log('[REDIS-RL] Fast-Fail Client Connected');
        });
    }

    return rateLimitClient;
};
