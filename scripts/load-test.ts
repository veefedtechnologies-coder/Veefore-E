import axios from 'axios';
import crypto from 'crypto';

const TARGET_URL = 'http://localhost:3000/api/webhooks/instagram';
const SECRET = process.env.WEBHOOK_SECRET || 'veefore-124'; 
const TOTAL_REQUESTS = 5000;
const CONCURRENCY = 100;

async function generateSignature(payload: string): Promise<string> {
  const hmac = crypto.createHmac('sha256', SECRET);
  return 'sha256=' + hmac.update(payload).digest('hex');
}

async function sendWebhook(id: number) {
  const payload = JSON.stringify({
    object: 'instagram',
    entry: [
      {
        id: '1234567890',
        time: Math.floor(Date.now() / 1000),
        messaging: [
          {
            sender: { id: `user_${id}` },
            recipient: { id: 'page_123' },
            message: {
              mid: `mid.$cAAa_${id}`,
              text: `Load test message ${id}`
            }
          }
        ]
      }
    ]
  });

  const signature = await generateSignature(payload);
  
  const startTime = Date.now();
  try {
    const response = await axios.post(TARGET_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': signature
      },
      timeout: 10000 // 10s timeout
    });
    
    return {
      success: true,
      status: response.status,
      latency: Date.now() - startTime
    };
  } catch (error: any) {
    return {
      success: false,
      status: error.response?.status || 500,
      latency: Date.now() - startTime,
      message: error.response?.data?.error || error.message
    };
  }
}

async function runLoadTest() {
  console.log(`🚀 Starting Phase 7 Load Test: ${TOTAL_REQUESTS} webhooks with concurrency of ${CONCURRENCY}`);
  const startTime = Date.now();
  
  let successCount = 0;
  let failCount = 0;
  let totalLatency = 0;
  let maxLatency = 0;
  
  // Create an array of tasks
  const tasks = Array.from({ length: TOTAL_REQUESTS }, (_, i) => i);
  
  // Process in chunks of CONCURRENCY
  for (let i = 0; i < tasks.length; i += CONCURRENCY) {
    const chunk = tasks.slice(i, i + CONCURRENCY);
    
    // Execute concurrent chunk
    const results = await Promise.all(chunk.map(id => sendWebhook(id)));
    
    for (const res of results) {
      if (res.success) successCount++;
      else failCount++;
      
      totalLatency += res.latency;
      if (res.latency > maxLatency) maxLatency = res.latency;
    }
    
    // Print progress
    if (i % 1000 === 0 && i > 0) {
      console.log(`Progress: ${i} / ${TOTAL_REQUESTS}`);
    }
  }
  
  const duration = (Date.now() - startTime) / 1000;
  
  console.log('\n========================================');
  console.log('✅ Phase 7 Load Test Complete');
  console.log('========================================');
  console.log(`Total Requests Sent: ${TOTAL_REQUESTS}`);
  console.log(`Total Time:          ${duration.toFixed(2)}s`);
  console.log(`Throughput:          ${(TOTAL_REQUESTS / duration).toFixed(2)} req/s`);
  console.log(`Success Rate:        ${((successCount / TOTAL_REQUESTS) * 100).toFixed(2)}%`);
  console.log(`Failed Requests:     ${failCount}`);
  console.log(`Avg Latency:         ${(totalLatency / TOTAL_REQUESTS).toFixed(2)}ms`);
  console.log(`Max Latency:         ${maxLatency}ms`);
  console.log('========================================');
}

runLoadTest().catch(console.error);
