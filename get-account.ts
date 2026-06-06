import mongoose from 'mongoose';
import { MongoStorage } from './server/mongodb-storage';
import { SocialAccountModel } from './server/models/Social';

async function run() {
  const storage = new MongoStorage();
  await storage.connect();
  const acc = await SocialAccountModel.findOne({ workspaceId: '684402c2fd2cd4eb6521b386', platform: 'instagram' });
  console.log(JSON.stringify(acc, null, 2));
  process.exit(0);
}
run();
