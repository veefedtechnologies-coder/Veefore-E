import { Queue } from 'bullmq';
import Redis from 'ioredis';

async function verifyJobs() {
  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  const metricsQueue = new Queue('metrics-fetch', { connection: redis });
  
  console.log('Fetching repeatable jobs from BullMQ (metrics-fetch)...');
  const repeatableJobs = await metricsQueue.getRepeatableJobs();
  
  console.log(`\nFound ${repeatableJobs.length} active recurring polling jobs:\n`);
  
  repeatableJobs.forEach(job => {
    console.log(`[JOB ID]: ${job.id}`);
    console.log(`[CRON / EVERY]: ${job.every ? `${job.every}ms (${job.every / 60000} minutes)` : job.cron}`);
    console.log(`[NEXT RUN]: ${new Date(job.next).toLocaleString()}`);
    console.log('----------------------------------------------------');
  });

  await redis.quit();
  process.exit(0);
}

verifyJobs().catch(console.error);
