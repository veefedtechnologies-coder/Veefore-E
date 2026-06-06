import 'dotenv/config';
import { InstagramApiService } from './server/services/instagramApi';
import { ApiMonitorService } from './server/services/api-monitor';
import { CacheService } from './server/services/cache-service';
import axios from 'axios';

async function runPhase3Verification() {
  console.log('--- PHASE 3 CACHE VERIFICATION ---');
  
  ApiMonitorService.getInstance().attachToAxios(axios);
  const cache = CacheService.getInstance();
  
  // Wait for Redis connection
  await new Promise(r => setTimeout(r, 1500));
  
  const mockToken = 'IGAA_MOCK_TOKEN_FOR_CACHE_VERIFY';
  const accountId = '999888777';
  
  const cacheKey = `api_batch_account_insights_${accountId}`;
  
  // Clear any existing cache for this test
  await cache.invalidate(cacheKey);

  console.log('\n[Request 1] Fetching Batch Account Insights (Network Hit expected)...');
  
  let firstCallFailed = false;
  try {
    // This will fail because the token is mock, but wait! If it fails, it doesn't cache.
    // I need to forcefully write to the cache to simulate a successful first network hit,
    // and then ensure the SECOND call doesn't even attempt a network hit!
    
    // Simulate successful first hit:
    console.log('Simulating successful first network response being cached...');
    await cache.set(cacheKey, [{ code: 200, body: '{"success": true}' }], 60);
    
  } catch (e) {
    firstCallFailed = true;
  }
  
  console.log('\n[Request 2] Fetching EXACT same Batch Account Insights 2 seconds later...');
  // Wait to ensure they are sequential, not simultaneous
  await new Promise(r => setTimeout(r, 2000));
  
  let secondCallThrew = false;
  try {
    const data = await InstagramApiService.getBatchAccountInsights(accountId, mockToken);
    console.log('Returned data from second call:', data);
  } catch (e) {
    secondCallThrew = true;
    console.log('Second call threw an error:', e);
  }
  
  const report = ApiMonitorService.getInstance().getReport();
  
  console.log('\n--- VERIFICATION RESULTS ---');
  console.log('Total Network API Calls:', report.overview.totalApiCalls);
  
  if (report.overview.totalApiCalls === 0 && !secondCallThrew) {
    console.log('✅ VERIFICATION PASSED: The second sequential call was served instantly from Redis Cache without hitting the network!');
  } else {
    console.log('❌ VERIFICATION FAILED: Cache did not prevent the network call.');
  }
  
  process.exit(0);
}

runPhase3Verification();
