import 'dotenv/config';
import Redis from 'ioredis';

async function checkRedisKeys() {
  const redis = new Redis(process.env.REDIS_URL as string);
  console.log('Connecting to Redis...');
  
  try {
    const keys = await redis.keys('*');
    console.log(`Found ${keys.length} keys in Redis:`);
    keys.forEach(k => console.log(' - ' + k));
  } catch (e) {
    console.error('Error fetching keys:', e);
  }
  
  process.exit(0);
}

checkRedisKeys();
