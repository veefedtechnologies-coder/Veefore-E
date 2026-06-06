import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';
dotenv.config();

import { SocialAccountModel } from './server/models/Social/SocialAccount';
import { tokenEncryption } from './server/security/token-encryption';

async function run() {
  await mongoose.connect(process.env.MONGODB_URI!, { dbName: process.env.MONGODB_DB_NAME || 'veeforedb' });
  const account = await SocialAccountModel.findOne({ username: 'arpit.10' });
  if (!account) return console.log('not found');
  let token = account.accessToken;
  if (!token && account.encryptedAccessToken) {
      token = tokenEncryption.decryptToken(account.encryptedAccessToken as any);
  }
  
  const mediaId = '17856505905638370';
  console.log('Fetching insights for media', mediaId);
  try {
    const url = `https://graph.facebook.com/v22.0/${mediaId}/insights?metric=reach,saved,impressions,engagement&access_token=${token}`;
    const res = await axios.get(url);
    console.log('Success:', JSON.stringify(res.data, null, 2));
  } catch (err: any) {
    console.error('Error:', err.response?.data || err.message);
  }
  process.exit(0);
}
run();
