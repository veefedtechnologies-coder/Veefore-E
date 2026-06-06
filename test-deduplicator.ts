import { RequestDeduplicator } from './server/services/request-deduplicator';
import { ApiMonitorService } from './server/services/api-monitor';
import axios from 'axios';

async function runTest() {
  const monitor = ApiMonitorService.getInstance();
  monitor.attachToAxios(axios);
  const deduplicator = RequestDeduplicator.getInstance();

  console.log('--- STARTING DEDUPLICATION TEST ---');

  let executeCount = 0;

  // A mock execution function that takes 500ms
  const mockApiCall = async () => {
    executeCount++;
    console.log(`Mock network request fired! (Total actual requests: ${executeCount})`);
    return new Promise(resolve => setTimeout(() => resolve('Mock Data Response'), 500));
  };

  const key = 'https://graph.instagram.com/mock-endpoint';

  // Fire 5 identical requests at the exact same time
  console.log('Firing 5 identical concurrent requests...');
  
  const promises = [];
  for (let i = 0; i < 5; i++) {
    promises.push(deduplicator.execute(key, mockApiCall));
  }

  const results = await Promise.all(promises);

  console.log('\n--- TEST RESULTS ---');
  console.log(`Total actual network requests fired: ${executeCount} (Expected: 1)`);
  
  const sharedCount = results.filter(r => r.shared).length;
  console.log(`Number of requests that successfully shared the Promise: ${sharedCount} (Expected: 4)`);
  
  console.log(`All returned expected data? ${results.every(r => r.data === 'Mock Data Response')}`);

  if (executeCount === 1 && sharedCount === 4) {
    console.log('\n✅ DEDUPLICATOR IS WORKING PERFECTLY!');
  } else {
    console.log('\n❌ DEDUPLICATOR FAILED!');
  }
}

runTest();
