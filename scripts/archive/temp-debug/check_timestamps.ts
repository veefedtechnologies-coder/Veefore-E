import mongoose from 'mongoose';
import { tokenEncryption } from './server/security/token-encryption';
import axios from 'axios';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI!, { dbName: 'veeforedb' });
  const account = await mongoose.connection.collection('socialaccounts').findOne({ username: 'arpit.10' });
  const token = tokenEncryption.decryptToken(account!.encryptedAccessToken);
  const igId = account!.accountId;

  const url = `https://graph.facebook.com/v22.0/${igId}/media?fields=id,timestamp,caption&access_token=${token}&limit=20`;
  const resp = await axios.get(url);
  console.log('Posts found:', resp.data.data.length);
  resp.data.data.forEach(p => {
    console.log(`Post ${p.id}: ${p.timestamp}`);
  });
  
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - 30);
  console.log('Current Date:', new Date().toISOString());
  console.log('Since Date (30 days ago):', sinceDate.toISOString());
  
  process.exit(0);
}
run();
