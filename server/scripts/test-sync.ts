import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

import { SocialAccountModel } from '../models/Social/SocialAccount';
import { SocialAccountService } from '../services/SocialAccountService';

async function run() {
  await mongoose.connect(process.env.MONGODB_URI!, { dbName: process.env.MONGODB_DB_NAME || 'veeforedb' });
  const account = await SocialAccountModel.findOne({ username: 'arpit.10' });
  if (!account) return console.log('not found');
  console.log('Syncing account', account._id);
  const service = new SocialAccountService();
  await service.syncAccount(account._id.toString());
  const updated = await SocialAccountModel.findOne({ username: 'arpit.10' });
  console.log('Sync complete!');
  console.log('Reach:', updated?.totalReach, 'Saves:', updated?.totalSaves, 'Shares:', updated?.totalShares);
  process.exit(0);
}
run();
