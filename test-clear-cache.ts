import 'dotenv/config';
import Redis from 'ioredis';

async function clearBadCache() {
  const redis = new Redis(process.env.REDIS_URL as string);
  console.log('Connecting to Redis...');
  
  try {
    const keys = await redis.keys('api_*');
    console.log(`Found ${keys.length} keys to clear`);
    
    if (keys.length > 0) {
      await redis.del(...keys);
      console.log('Cleared all api_ keys');
    }
  } catch (e) {
    console.error('Error clearing keys:', e);
  }
  
  process.exit(0);
}

clearBadCache();
