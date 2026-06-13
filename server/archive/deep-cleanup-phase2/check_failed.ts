import { Queue } from 'bullmq';
import IORedis from 'ioredis';

async function main() {
  const connection = new IORedis('rediss://default:gQAAAAAAAhuFAAIgcDJlYThmN2ZhYzUxN2I0ZDNkYWZhY2E2OWIxZjQ2NGJlYg@literate-swan-138117.upstash.io:6379', {
    tls: { rejectUnauthorized: false }
  });
  const queue = new Queue('message-processing', { connection });
  const failedCount = await queue.getFailedCount();
  console.log(`Failed count: ${failedCount}`);
  if (failedCount > 0) {
    const jobs = await queue.getFailed(0, 10);
    for (const job of jobs) {
      console.log(`Job ${job.id} failed:`, job.failedReason);
      console.log(job.stacktrace);
    }
  }
  process.exit(0);
}
main();
