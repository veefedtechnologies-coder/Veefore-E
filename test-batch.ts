import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';
dotenv.config({ path: path.join(process.cwd(), '.env') });

import { SocialAccountModel } from './server/models/Social/SocialAccount';
import { tokenEncryption } from './server/security/token-encryption';
import InstagramApiService from './server/services/instagramApi';

async function run() {
  await mongoose.connect(process.env.MONGODB_URI!, { dbName: process.env.MONGODB_DB_NAME || 'veeforedb' });
  const account = await SocialAccountModel.findOne({ username: 'arpit.10' });
  if (!account) return console.log('not found');
  let token = account.accessToken;
  if (!token && account.encryptedAccessToken) {
      token = tokenEncryption.decryptToken(account.encryptedAccessToken as any);
  }
  
  const recentMedia = await InstagramApiService.getRecentMediaWithInsights(token, account.accountId, undefined, 17);
  console.log('recentMedia count:', recentMedia.length);
  recentMedia.forEach(m => console.log(m.id, m.media_type, m.insights));

  process.exit(0);
}
run();
