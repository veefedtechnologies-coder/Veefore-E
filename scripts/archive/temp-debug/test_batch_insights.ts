import axios from 'axios';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN; // Use existing token if available
  if (!token) {
    console.error('No token found');
    return;
  }

  const mediaId = '18029094037568164'; // Use a known image ID if possible, or just test with a dummy batch
  const metrics = ['reach', 'video_views']; // Mixed metrics
  
  const batchEntries = [{
    method: 'GET',
    relative_url: `${mediaId}/insights?metric=${metrics.join(',')}`
  }];

  const params = new URLSearchParams();
  params.append('batch', JSON.stringify(batchEntries));
  params.append('access_token', token);

  try {
    const response = await axios.post('https://graph.facebook.com/v22.0/', params);
    console.log('BATCH RESULT:', JSON.stringify(response.data, null, 2));
  } catch (e: any) {
    console.error('BATCH ERROR:', e.response?.data || e.message);
  }
}

run();
