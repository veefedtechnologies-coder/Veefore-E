import 'dotenv/config';
import Redis from 'ioredis';

async function checkCacheStats() {
  const redis = new Redis(process.env.REDIS_URL as string);
  console.log('Connecting to Redis...');
  
  try {
    const info = await redis.info('stats');
    const hitsMatch = info.match(/keyspace_hits:(\d+)/);
    const missesMatch = info.match(/keyspace_misses:(\d+)/);
    
    console.log(`Cache Hits: ${hitsMatch ? hitsMatch[1] : 0}`);
    console.log(`Cache Misses: ${missesMatch ? missesMatch[1] : 0}`);
    
    const keys = await redis.keys('api_*');
    console.log(`\nFound ${keys.length} api_* keys in Redis:`);
    keys.forEach(k => console.log(' - ' + k));
  } catch (e) {
    console.error('Error fetching stats:', e);
  }
  
  process.exit(0);
}

checkCacheStats();
