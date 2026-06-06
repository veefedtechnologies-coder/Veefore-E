import { Queue } from 'bullmq';
import Redis from 'ioredis';
import dotenv from 'dotenv';
dotenv.config({path: '../.env'});

async function check() {
  const connection = new Redis(process.env.REDIS_URL as string);
  const q = new Queue('message-processing', { connection });
  const failed = await q.getFailed();
  console.log('Message processing failed count:', failed.length);
  for (const job of failed) {
    console.log(job.id, job.failedReason);
  }
  process.exit(0);
}
check();
