import 'dotenv/config';
import Redis from 'ioredis';

async function readCacheValue() {
  const redis = new Redis(process.env.REDIS_URL as string);
  console.log('Connecting to Redis...');
  
  try {
    const keys = await redis.keys('api_batch_account_insights_*');
    if (keys.length === 0) {
      console.log('No keys found');
      process.exit(0);
    }
    
    for (const key of keys) {
      const val = await redis.get(key);
      console.log(`\nKey: ${key}`);
      console.log(`Value preview (first 200 chars): ${val?.substring(0, 200)}`);
      
      try {
        const parsed = JSON.parse(val as string);
        console.log(`Is Array? ${Array.isArray(parsed)}`);
      } catch(e) {
        console.log('Parse error');
      }
    }
    
  } catch (e) {
    console.error('Error:', e);
  }
  
  process.exit(0);
}

readCacheValue();
