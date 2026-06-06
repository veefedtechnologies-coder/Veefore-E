import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
  const { socialAccountService } = await import('./server/services/SocialAccountService.js');
  
  // Try to list ALL accounts first to see what's in the DB
  const { SocialAccountModel } = await import('./server/models/Social/SocialAccount.js');
  const allAccounts = await SocialAccountModel.find({}).limit(5);
  console.log(`Found ${allAccounts.length} total accounts in DB`);
  allAccounts.forEach(acc => {
    console.log(`Account ID: ${acc.accountId} | workspaceId: ${acc.workspaceId} (${typeof acc.workspaceId})`);
  });
  
  process.exit(0);
}
run().catch(console.error);
