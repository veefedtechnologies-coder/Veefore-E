import { Queue } from 'bullmq';
import dotenv from 'dotenv';
dotenv.config();

const queue = new Queue('metrics-fetch', {
  connection: {
    url: process.env.REDIS_URL
  }
});

async function run() {
  const jobs = await queue.getRepeatableJobs();
  for (const job of jobs) {
    if (job.name === 'fetch-metrics') {
      await queue.removeRepeatableByKey(job.key);
      console.log('Removed orphaned job:', job.key);
    }
  }
  process.exit(0);
}
run();
