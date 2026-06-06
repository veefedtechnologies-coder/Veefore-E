import mongoose from 'mongoose';
import { SocialAccountModel } from './models/Social/SocialAccount.js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

async function run() {
  await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
  const accounts = await SocialAccountModel.find({ platform: 'instagram' });
  console.log(`Found ${accounts.length} Instagram accounts in veeforedb`);
  accounts.forEach(a => console.log(`username: ${a.username}, followers: ${a.followersCount}, isActive: ${a.isActive}, lastSync: ${a.lastSyncAt}, id: ${a._id}`));
  process.exit(0);
}
run();
