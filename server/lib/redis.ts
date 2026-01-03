import Redis from 'ioredis';

// Singleton Redis client instance
let redisClient: Redis | null = null;
let redisSubscriber: Redis | null = null;

const getRedisOptions = (url: string | undefined): any => {
    if (!url) return {};

    const isTls = url.startsWith('rediss://') || url.includes(':443');

    // Base options
    const options: any = {
        family: 4, // Force IPv4 to avoid ENETUNREACH on some platforms
        keepAlive: 10000,
        enableReadyCheck: false
    };

    // Add TLS if detected (Upstash/Vercel KV requires this)
    if (isTls) {
        options.tls = {
            rejectUnauthorized: false // Helpful for some hosted redis providers
        };
    }

    return options;
};

export const getRedisClient = (): Redis => {
    if (!redisClient) {
        // Support standard REDIS_URL or Vercel's KV_URL / STORAGE_REDIS_URL
        const redisUrl = process.env.REDIS_URL ||
            process.env.KV_URL ||
            process.env.STORAGE_REDIS_URL;

        if (!redisUrl) {
            console.warn('[REDIS] REDIS_URL (or KV_URL) not set, falling back to localhost default');
        }

        console.log('[REDIS] Connecting to:', redisUrl ? 'External Redis' : 'Localhost');

        const baseOptions = getRedisOptions(redisUrl);
        redisClient = new Redis(redisUrl || 'redis://localhost:6379', {
            ...baseOptions,
            maxRetriesPerRequest: null, // Required for BullMQ
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

        const baseOptions = getRedisOptions(redisUrl);
        redisSubscriber = new Redis(redisUrl || 'redis://localhost:6379', {
            ...baseOptions,
            maxRetriesPerRequest: null,
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

        const baseOptions = getRedisOptions(redisUrl);
        rateLimitClient = new Redis(redisUrl || 'redis://localhost:6379', {
            ...baseOptions,
            // Fail fast settings
            maxRetriesPerRequest: 1,       // Don't retry commands forever
            enableOfflineQueue: false,      // Don't queue commands if disconnected
            commandTimeout: 2000,           // 2s hard timeout on commands (increased from 1s)
            connectTimeout: 10000,          // 10s connection timeout (increased from 1s)
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
