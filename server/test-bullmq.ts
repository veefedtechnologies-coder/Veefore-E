import { Queue } from 'bullmq';
import dotenv from 'dotenv';
dotenv.config();

const queue = new Queue('test-queue', { connection: { url: process.env.REDIS_URL } });

async function run() {
  await queue.drain();
  
  // Method 1: Using jobId outside repeat
  await queue.add('test', {}, { repeat: { every: 10000 }, jobId: 'my-job-id-1' });
  
  // Method 2: Using jobId inside repeat
  await queue.add('test', {}, { repeat: { every: 10000, jobId: 'my-job-id-2' } });

  // Method 3: Using key inside repeat
  await queue.add('test', {}, { repeat: { every: 10000, key: 'my-job-id-3' } as any });

  const jobs = await queue.getRepeatableJobs();
  console.log('Jobs:');
  jobs.forEach(j => {
     console.log(`key: ${j.key}, id: ${j.id}, name: ${j.name}`);
  });
  
  process.exit(0);
}
run();
