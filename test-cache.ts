import 'dotenv/config';
import { CacheService } from './server/services/cache-service';

async function runCacheSuccessTest() {
  console.log('--- PHASE 3 REDIS CACHE TEST ---');
  
  if (!process.env.REDIS_URL) {
    console.error('❌ Missing REDIS_URL in environment');
    process.exit(1);
  }
  console.log('Using REDIS_URL:', process.env.REDIS_URL.substring(0, 20) + '...');
  
  const cache = CacheService.getInstance();
  
  // Wait a moment for connection
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  const testKey = 'test_cache_key_123';
  const testData = { success: true, message: 'Redis is working perfectly!', timestamp: Date.now() };
  
  console.log('\n[Test 1] Writing to Redis...');
  await cache.set(testKey, testData, 60); // 60s TTL
  
  console.log('\n[Test 2] Reading from Redis...');
  const retrieved = await cache.get<any>(testKey);
  
  if (retrieved && retrieved.success === true) {
    console.log('✅ PASSED: Data successfully written and read from Upstash Redis!');
    console.log('Retrieved Data:', retrieved);
  } else {
    console.log('❌ FAILED: Could not retrieve data from Redis.');
    console.log('Retrieved Data:', retrieved);
    process.exit(1);
  }
  
  console.log('\n[Test 3] Invalidating key...');
  await cache.invalidate(testKey);
  const verifyDeleted = await cache.get<any>(testKey);
  if (!verifyDeleted) {
    console.log('✅ PASSED: Data successfully invalidated.');
  } else {
    console.log('❌ FAILED: Data still exists after invalidation.');
    process.exit(1);
  }
  
  console.log('\n🎉 ALL REDIS TESTS PASSED!');
  process.exit(0);
}

runCacheSuccessTest();
