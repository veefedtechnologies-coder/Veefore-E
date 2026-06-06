import Redis from 'ioredis';
import 'dotenv/config';

async function checkCache() {
  const redisUrl = process.env.REDIS_URL as string;
  console.log('Connecting to:', redisUrl);
  
  const redis = new Redis(redisUrl, { tls: { rejectUnauthorized: false } });
  
  try {
    const keys = await redis.keys('api_*');
    console.log(`Found ${keys.length} API cache keys!`);
    
    for (const key of keys.slice(0, 5)) {
      const ttl = await redis.ttl(key);
      console.log(`- ${key} (TTL: ${ttl}s)`);
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    redis.disconnect();
  }
}

checkCache();
