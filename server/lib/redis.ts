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
