import { Queue } from 'bullmq';
import IORedis from 'ioredis';

async function main() {
  const connection = new IORedis('rediss://default:gQAAAAAAAhuFAAIgcDJlYThmN2ZhYzUxN2I0ZDNkYWZhY2E2OWIxZjQ2NGJlYg@literate-swan-138117.upstash.io:6379', {
    tls: { rejectUnauthorized: false }
  });
  const queue = new Queue('message-processing', { connection });
  const waiting = await queue.getWaitingCount();
  const active = await queue.getActiveCount();
  const failed = await queue.getFailedCount();
  console.log(`waiting: ${waiting}, active: ${active}, failed: ${failed}`);
  
  const failedJobs = await queue.getFailed();
  if (failedJobs.length > 0) {
    console.log('Failed job error:', failedJobs[0].failedReason);
  }
  process.exit(0);
}
main();
