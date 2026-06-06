import { Queue } from 'bullmq';
import Redis from 'ioredis';

async function verifyJobs() {
  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  const postQueue = new Queue('post-scheduler', { connection: redis });
  
  console.log('Fetching repeatable jobs from BullMQ (post-scheduler)...');
  const repeatableJobs = await postQueue.getRepeatableJobs();
  
  console.log(`\nFound ${repeatableJobs.length} active recurring jobs:\n`);
  
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
