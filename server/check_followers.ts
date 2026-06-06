import { MongoStorage } from './mongodb-storage';
import { SocialAccountModel } from './models/Social';
import mongoose from 'mongoose';

async function run() {
  const storage = new MongoStorage();
  await storage.connect();
  const accounts = await SocialAccountModel.find({ platform: 'instagram' });
  for (const acc of accounts) {
    console.log(`Username: ${acc.username}, followersCount: ${acc.followersCount}`);
  }
  process.exit(0);
}
run();
