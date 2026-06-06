import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import * as dotenv from 'dotenv';

dotenv.config();

async function checkQueues() {
  const redis = new IORedis(process.env.REDIS_URL || '');
  
  const queues = ['metrics-fetch', 'webhook-process', 'token-refresh'];
  
  console.log('--- Phase 4 Queue Verification ---');
  
  for (const name of queues) {
    const queue = new Queue(name, { connection: redis });
    const count = await queue.count();
    const workers = await queue.getWorkers();
    
    console.log(`\nQueue: ${name}`);
    console.log(`Total Jobs: ${count}`);
    console.log(`Active Workers: ${workers.length}`);
    
    if (name === 'metrics-fetch') {
      const repeatableJobs = await queue.getRepeatableJobs();
      console.log('Repeatable Jobs (Scheduled Tasks):');
      repeatableJobs.forEach(job => {
        console.log(` - ID: ${job.id}, Pattern: ${job.pattern}, Next: ${new Date(job.next).toLocaleString()}`);
      });
    }
    
    await queue.close();
  }
  
  redis.disconnect();
}

checkQueues().catch(console.error);
