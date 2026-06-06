import mongoose from 'mongoose';
import { socialAccountService } from '../services/SocialAccountService';
import { SocialAccountModel } from '../models/Social/SocialAccount';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

async function testPartialFetch() {
  await mongoose.connect(process.env.MONGODB_URI || '');
  console.log('✅ Connected to MongoDB');

  const account = await SocialAccountModel.findOne({ platform: 'instagram' });
  if (!account) {
    console.log('No instagram account found');
    process.exit(0);
  }

  const accountId = (account as any)._id.toString();

  console.log(`\n==========================================`);
  console.log(`TEST 1: Fetching REACH only (Insights, NO Media)`);
  console.log(`==========================================`);
  await socialAccountService.syncAccount(accountId, { metricsType: 'reach' });

  console.log(`\n==========================================`);
  console.log(`TEST 2: Fetching LIKES only (Media, NO Insights)`);
  console.log(`==========================================`);
  await socialAccountService.syncAccount(accountId, { metricsType: 'likes' });

  console.log('✅ Tests complete!');
  process.exit(0);
}

testPartialFetch().catch(console.error);
