import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || '');
  
  const { SocialAccountModel } = await import('../models/Social/SocialAccount.js');
  const { SocialAccountService } = await import('../services/SocialAccountService.js');
  const { AnalyticsService } = await import('../services/AnalyticsService.js');
  
  const accounts = await SocialAccountModel.find({ isActive: true });
  console.log(`Found ${accounts.length} active accounts to sync`);
  
  const socialAccountService = new SocialAccountService();
  const analyticsService = new AnalyticsService();
  
  for (const account of accounts) {
    try {
      console.log(`Syncing account @${account.username}...`);
      await socialAccountService.syncAccount(account._id.toString(), { forceRefresh: true, metricsType: 'all' });
      await analyticsService.generateDailySnapshot(account.workspaceId.toString(), 'instagram');
      console.log(`Synced @${account.username} successfully`);
    } catch (err: any) {
      console.error(`Failed to sync @${account.username}:`, err.message);
    }
  }
  
  console.log('All done!');
  process.exit(0);
}

run();
