import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
import mongoose from 'mongoose';
import { SocialAccountModel } from './models/Social/SocialAccount.js';
import { InstagramApiService } from './services/instagramApi.js';
import { getAccessTokenFromAccount } from './storage/converters.js';

async function run() {
  await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
  const account = await SocialAccountModel.findOne({ username: 'rahulc1020' });
  if (!account) { console.log('not found'); process.exit(1); }
  const token = getAccessTokenFromAccount(account);
  if (!token) { console.log('no token'); process.exit(1); }
  const info = await InstagramApiService.getAccountInfo(token, account.accountId as string);
  console.log('Instagram API returned:', info);
  process.exit(0);
}
run();
