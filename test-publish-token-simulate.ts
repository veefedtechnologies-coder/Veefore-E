import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import { socialAccountService } from './server/services/SocialAccountService.js';
import { getAccessTokenFromAccount } from './server/storage/converters.js';

async function run() {
  await mongoose.connect(process.env.MONGODB_URI!, { dbName: 'veeforedb' });
  const instagramAccount = await socialAccountService.getAccountByPlatform('684402c2fd2cd4eb6521b386', 'instagram');
  if (instagramAccount) {
    const token = getAccessTokenFromAccount(instagramAccount);
    console.log("Token from function:", token ? "exists: " + token.substring(0,10) + "..." : "null");
  } else {
    console.log("No account found");
  }
  process.exit(0);
}
run();
