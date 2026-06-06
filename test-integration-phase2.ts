import { InstagramApiService } from './server/services/instagramApi';
import { ApiMonitorService } from './server/services/api-monitor';
import axios from 'axios';
import { RequestDeduplicator } from './server/services/request-deduplicator';

async function verifyDeduplicatorIntegration() {
  console.log('--- VERIFYING PHASE 2 DEDUPLICATION INTEGRATION ---');

  // 1. Ensure monitor is attached (like in index.ts)
  ApiMonitorService.getInstance().attachToAxios(axios);

  const mockToken = 'IGAA_MOCK_TOKEN_FOR_TESTING_123';
  const accountId = '1234567890';

  console.log('\n[Test 1] Firing 3 concurrent getAccountInfo calls (which uses makeApiRequest -> axios.get)...');
  
  // Since we use a mock token, it will fail, but the deduplicator should STILL coalesce the failed requests!
  // Note: we just want to see if deduplicator steps in and prevents 3 network calls.
  
  const p1 = InstagramApiService.getAccountInfo(mockToken, accountId);
  const p2 = InstagramApiService.getAccountInfo(mockToken, accountId);
  const p3 = InstagramApiService.getAccountInfo(mockToken, accountId);
  
  const results = await Promise.allSettled([p1, p2, p3]);
  
  console.log(`Results completed. Count: ${results.length}`);
  
  console.log('\n[Test 2] Firing 2 concurrent getBatchAccountInsights calls...');
  const bp1 = InstagramApiService.getBatchAccountInsights(accountId, mockToken);
  const bp2 = InstagramApiService.getBatchAccountInsights(accountId, mockToken);
  
  await Promise.allSettled([bp1, bp2]);

  console.log('\n--- MONITOR DASHBOARD METRICS ---');
  const report = ApiMonitorService.getInstance().getReport();
  console.log(JSON.stringify(report.overview, null, 2));

  // Validation Check
  if (report.overview.totalDeduplicated >= 3) {
    console.log('\n✅ VERIFICATION PASSED: Deduplicator successfully caught concurrent internal requests!');
  } else {
    console.log('\n❌ VERIFICATION FAILED: Deduplicator did not increment totalDeduplicated correctly.');
  }
}

verifyDeduplicatorIntegration();
