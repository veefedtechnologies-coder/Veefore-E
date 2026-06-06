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
  console.log('Repeatable Jobs Count:', jobs.length);
  jobs.forEach(j => {
     console.log(`key: ${j.key}, id: ${j.id}, name: ${j.name}`);
  });
  process.exit(0);
}
run();
