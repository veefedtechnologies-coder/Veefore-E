import { Queue } from 'bullmq';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const queue = new Queue('metrics-fetch', { connection: { url: process.env.REDIS_URL } });

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || '');
  const SocialAccountModel = mongoose.model('SocialAccount', new mongoose.Schema({}, { strict: false }));
  
  const acc = await SocialAccountModel.findOne({ platform: 'instagram' }) as any;
  const workspaceId = acc.workspaceId.toString();
  const metaAccountId = acc.instagramAccountId || acc.accountId;
  const mongoId = acc._id?.toString() || acc.id;
  
  const repeatableJobs = await queue.getRepeatableJobs();
  
  const metricType = 'followers';
  
  const expectedKeyMeta = `smart-poll-${workspaceId}-${metaAccountId}-${metricType}`;
  const expectedKeyMongo = `smart-poll-${workspaceId}-${mongoId}-${metricType}`;
  
  const job = repeatableJobs.find((j: any) => 
    (j.key && (j.key.includes(expectedKeyMeta) || j.key.includes(expectedKeyMongo))) || 
    j.name === expectedKeyMeta || j.name === expectedKeyMongo
  );

  console.log('Mongo ID:', mongoId);
  console.log('Meta ID:', metaAccountId);
  console.log('Job found?', !!job);
  
  if (job) {
    const nextInMs = Math.max(0, job.next - Date.now());
    console.log('Next in min:', Math.round(nextInMs / 1000 / 60));
  }
  
  process.exit(0);
}
run();
