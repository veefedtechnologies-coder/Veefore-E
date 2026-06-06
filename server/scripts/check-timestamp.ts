import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env') });

import { tokenEncryption } from '../security/token-encryption';
import InstagramApiService from '../services/instagramApi';
import { SocialAccountModel } from '../models/Social/SocialAccount';

async function run() {
  await mongoose.connect(process.env.MONGODB_URI!, { dbName: process.env.MONGODB_DB_NAME || 'veeforedb' });
  const account = await SocialAccountModel.findOne({ username: 'arpit.10' });
  let token = account!.accessToken;
  if (!token && account!.encryptedAccessToken) {
      token = tokenEncryption.decryptToken(account!.encryptedAccessToken as any);
  }
  
  const recentMedia = await InstagramApiService.getRecentMediaWithInsights(token, account!.accountId);
  
  recentMedia.forEach((m, i) => {
    console.log(`Post ${i+1}: timestamp=${m.timestamp}`);
  });

  process.exit(0);
}
run();
