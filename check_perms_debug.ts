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

    const url = `https://graph.facebook.com/debug_token?input_token=${token}&access_token=${token}`;
    const resp = await axios.get(url);
    console.log(JSON.stringify(resp.data.data, null, 2));

  } catch (e: any) {
    console.error(JSON.stringify(e.response?.data || e.message, null, 2));
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}
run();
