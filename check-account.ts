import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import { SocialAccountModel } from './server/models/Social';

async function run() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const acc = await SocialAccountModel.findOne({ workspaceId: '684402c2fd2cd4eb6521b386', platform: 'instagram' });
  console.log("Account:", acc ? { id: acc._id, accessToken: acc.accessToken ? "exists" : "missing", encryptedToken: acc.encryptedAccessToken ? "exists" : "missing" } : "null");
  process.exit(0);
}
run();
