import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/veefore');
  const { SocialAccountModel } = await import('./models/Social/SocialAccount');
  const accounts = await SocialAccountModel.find({}).lean();
  console.log(JSON.stringify(accounts.map(a => ({ id: a._id, accountId: a.accountId, pageId: a.pageId, platform: a.platform, isActive: a.isActive, username: a.username })), null, 2));
  process.exit(0);
}
run();
