import axios from 'axios';
import { ApiMonitorService } from './server/services/api-monitor';

async function runTest() {
  console.log('Attaching monitor to axios...');
  const monitor = ApiMonitorService.getInstance();
  monitor.attachToAxios(axios);

  console.log('Making mock API calls to Instagram Graph API...');
  
  // Call 1
  try {
    await axios.get('https://graph.instagram.com/v22.0/me?fields=id,name&access_token=MOCK_TOKEN');
  } catch (e) {
    // Expected to fail since token is mock
  }

  // Call 2 (Duplicate test - start two at once)
  try {
    const p1 = axios.get('https://graph.instagram.com/v22.0/me?fields=id,name&access_token=MOCK_TOKEN2');
    const p2 = axios.get('https://graph.instagram.com/v22.0/me?fields=id,name&access_token=MOCK_TOKEN2');
    await Promise.allSettled([p1, p2]);
  } catch (e) {}
  
  // Simulate batch tracking
  monitor.trackBatchRequests(3, false);

  console.log('\n--- MONITOR REPORT ---');
  console.log(JSON.stringify(monitor.getReport(), null, 2));
}

runTest();
