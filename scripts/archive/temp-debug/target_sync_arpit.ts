import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { SocialAccountService } from './server/services/SocialAccountService';
dotenv.config();

async function run() {
  try {
    console.log('Connecting to DB...');
    await mongoose.connect(process.env.MONGODB_URI!, { dbName: 'veeforedb' });
    console.log('Connected!');

    // Explicitly import models to register them
    await import('./server/models/Social/SocialAccount');
    await import('./server/models/Content/Content');
    await import('./server/models/Metrics');
    await import('./server/models/Analytics/Analytics');

    const account = await mongoose.connection.collection('socialaccounts').findOne({ username: 'arpit.10' });
    if (!account) {
      console.log('Account arpit.10 not found');
      return;
    }

    console.log('Syncing arpit.10...');
    const service = new SocialAccountService();
    await service.syncAccount(account._id.toString());
    console.log('Sync successful!');

  } catch (e: any) {
    console.error('Error during sync:', e.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}
run();
