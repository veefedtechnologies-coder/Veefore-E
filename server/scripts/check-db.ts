import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env') });

import { SocialAccountModel } from '../models/Social/SocialAccount';
import { AnalyticsModel } from '../models/Analytics/Analytics';

async function run() {
  await mongoose.connect(process.env.MONGODB_URI!, { dbName: process.env.MONGODB_DB_NAME || 'veeforedb' });
  const account = await SocialAccountModel.findOne({ username: 'arpit.10' });
  if (!account) return console.log('not found');
  
  console.log('--- SOCIAL ACCOUNT ---');
  console.log('Reach:', account.totalReach);
  console.log('Saves:', account.totalSaves);
  console.log('Shares:', account.totalShares);
  console.log('Likes:', account.totalLikes);
  console.log('Comments:', account.totalComments);

  const analytics = await AnalyticsModel.find({ workspaceId: account.workspaceId }).sort({ date: -1 }).limit(1);
  console.log('\n--- LATEST ANALYTICS ---');
  console.log(analytics[0]);
  process.exit(0);
}
run();
