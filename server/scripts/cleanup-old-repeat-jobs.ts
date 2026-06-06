import { metricsQueue, redisConnection } from '../queues/metricsQueue';

async function cleanup() {
  if (!redisConnection) {
    console.log('Redis not connected');
    process.exit(0);
  }
  
  if (!metricsQueue) {
    console.log('Metrics queue not found');
    process.exit(0);
  }

  const repeatableJobs = await metricsQueue.getRepeatableJobs();
  console.log(`Found ${repeatableJobs.length} repeatable jobs.`);
  
  let removed = 0;
  for (const job of repeatableJobs) {
    // If the job key contains followers, likes, comments, reach, impressions
    if (job.key.includes('smart-poll-') && !job.key.includes('-all')) {
      console.log(`Removing old repeatable job: ${job.key}`);
      await metricsQueue.removeRepeatableByKey(job.key);
      removed++;
    }
  }
  
  console.log(`Removed ${removed} old jobs.`);
  process.exit(0);
}

cleanup().catch(console.error);
