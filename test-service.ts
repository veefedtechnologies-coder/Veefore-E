import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
  const { socialAccountService } = await import('./server/services/SocialAccountService.js');
  
  const accounts = await socialAccountService.getActiveAccountsByWorkspace("1");
  console.log(`Found ${accounts.length} active accounts.`);
  accounts.forEach((acc: any) => {
    console.log(`Account ID: ${acc.accountId} | username: ${acc.username} | totalViews: ${acc.totalViews}`);
  });
  
  process.exit(0);
}
run().catch(console.error);
