import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

const { socialAccountService } = require('./server/services/SocialAccountService');

async function testSync() {
  try {
    await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
    const accId = '17841406961110225'; // arpit.10's accountId
    console.log('Syncing account', accId);
    const result = await socialAccountService.syncAccount(accId);
    console.log('Sync complete. Followers:', result.followersCount);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
testSync();
