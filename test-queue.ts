import 'dotenv/config';
import { MetricsQueueManager } from './server/queues/metricsQueue';
import mongoose from 'mongoose';

async function testQueue() {
  console.log('Testing MetricsQueueManager...');
  try {
    const dummyWorkspaceId = new mongoose.Types.ObjectId().toString();
    const dummyAccountId = new mongoose.Types.ObjectId().toString();

    console.log(`Scheduling fetch for workspace: ${dummyWorkspaceId}, account: ${dummyAccountId}`);
    await MetricsQueueManager.scheduleMetricsFetch(
      dummyWorkspaceId,
      'system',
      dummyAccountId,
      'dummy_token',
      'all',
      { priority: 5, forceRefresh: true }
    );
    
    console.log('✅ Queue dispatch successful!');
    
    const stats = await MetricsQueueManager.getQueueStats();
    console.log('Queue Stats:', stats);

    process.exit(0);
  } catch (err) {
    console.error('❌ Error during queue dispatch:', err);
    process.exit(1);
  }
}

testQueue();
