import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
  
  // Wait for the connection to be fully ready to avoid buffer commands error
  if (mongoose.connection.readyState !== 1) {
      await new Promise(resolve => mongoose.connection.once('connected', resolve));
  }
  
  console.log("Connected to MongoDB");

  const { SocialAccountModel } = await import('./server/models/Social/SocialAccount.js');
  const allAccounts = await SocialAccountModel.find({}).limit(5);
  console.log(`Found ${allAccounts.length} total accounts in DB`);
  allAccounts.forEach(acc => {
    console.log(`Account ID: ${acc.accountId} | workspaceId: ${acc.workspaceId} (${typeof acc.workspaceId}) | username: ${acc.username} | totalViews: ${acc.totalViews}`);
  });
  
  process.exit(0);
}
run().catch(console.error);
