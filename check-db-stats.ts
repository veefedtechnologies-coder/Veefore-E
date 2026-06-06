import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
  const schema = new mongoose.Schema({
    accountId: String,
    platform: String,
    username: String,
    followersCount: Number,
    totalLikes: Number,
    totalViews: Number,
    totalComments: Number
  }, { collection: 'socialaccounts' });
  const SocialAccount = mongoose.models.SocialAccount || mongoose.model('SocialAccount', schema);
  
  const accounts = await SocialAccount.find({});
  console.log(`Found ${accounts.length} social accounts.`);
  accounts.forEach((acc: any) => {
    console.log(`Account ID: ${acc.accountId} | Platform: ${acc.platform} | Username: ${acc.username}`);
    console.log(`- followers: ${acc.followersCount} | likes: ${acc.totalLikes} | views: ${acc.totalViews} | comments: ${acc.totalComments}`);
  });
  
  process.exit(0);
}
run().catch(console.error);
