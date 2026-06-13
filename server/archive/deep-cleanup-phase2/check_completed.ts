import { Queue } from 'bullmq';
import IORedis from 'ioredis';

async function main() {
  const connection = new IORedis('rediss://default:gQAAAAAAAhuFAAIgcDJlYThmN2ZhYzUxN2I0ZDNkYWZhY2E2OWIxZjQ2NGJlYg@literate-swan-138117.upstash.io:6379', {
    tls: { rejectUnauthorized: false }
  });
  const queue = new Queue('message-processing', { connection });
  const completed = await queue.getCompletedCount();
  console.log(`completed: ${completed}`);
  
  const completedJobs = await queue.getCompleted(0, 5);
  for (const job of completedJobs) {
    console.log('Completed job:', job.id, job.data);
  }
  process.exit(0);
}
main();
