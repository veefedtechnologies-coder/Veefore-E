import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: 1,
  connectTimeout: 2000,
});

redis.on('error', (err) => {
  console.error('Redis connection failed:', err.message);
  process.exit(1);
});

redis.ping().then((res) => {
  console.log('Redis is up:', res);
  process.exit(0);
}).catch(() => {
  console.error('Ping failed');
  process.exit(1);
});
