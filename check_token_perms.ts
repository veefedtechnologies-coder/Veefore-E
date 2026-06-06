import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import axios from 'axios';
import { SocialAccountModel } from './server/models/Social/SocialAccount';

dotenv.config();

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI!, { dbName: 'veeforedb' });
    const account = await SocialAccountModel.findOne({ platform: 'instagram' });
    if (!account) {
      console.error('No account found');
      return;
    }

    const token = account.accessToken;
    console.log('Checking token for account:', account.username);
    
    const url = `https://graph.facebook.com/debug_token?input_token=${token}&access_token=${token}`;
    const response = await axios.get(url);
    console.log('Token Debug Info:', JSON.stringify(response.data.data, null, 2));

  } catch (e: any) {
    console.error('Error:', e.response?.data || e.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

run();
