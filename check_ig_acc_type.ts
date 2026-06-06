import axios from 'axios';
import mongoose from 'mongoose';
import { tokenEncryption } from './server/security/token-encryption';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI!, { dbName: 'veeforedb' });
    const account = await mongoose.connection.collection('socialaccounts').findOne({ username: 'arpit.10' });
    const token = tokenEncryption.decryptToken(account!.encryptedAccessToken);
    const igId = account!.accountId;

    console.log('Checking Account:', igId);
    const url = `https://graph.facebook.com/v22.0/${igId}?fields=account_type,media_count,username,is_verified,is_business_account&access_token=${token}`;
    const resp = await axios.get(url);
    console.log('Account Info from API:', JSON.stringify(resp.data, null, 2));

  } catch (e: any) {
    console.error('Error:', e.response?.data || e.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}
run();
