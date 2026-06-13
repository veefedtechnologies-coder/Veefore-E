import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { socialAccountService } from './server/services/SocialAccountService';
import { SocialAccountModel } from './server/models/Social/SocialAccount';

dotenv.config();

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI!, { dbName: 'veeforedb' });
    console.log('Connected to DB');

    const account = await SocialAccountModel.findOne({ platform: 'instagram' });
    if (!account) {
      console.error('No account found');
      return;
    }

    console.log(`Syncing account @${account.username} (${account._id})...`);
    await socialAccountService.syncAccount(account._id.toString());
    console.log('Sync completed');

  } catch (e: any) {
    console.error('Error:', e.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

run();
