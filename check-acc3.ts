import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import { SocialAccountModel } from './server/models/Social.js';

async function run() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const accounts = await SocialAccountModel.find({});
  for (const acc of accounts) {
    if (acc.platform === 'instagram') {
      console.log("Found:", acc.workspaceId, acc.username);
      console.log("Token:", acc.accessToken);
    }
  }
  process.exit(0);
}
run();
