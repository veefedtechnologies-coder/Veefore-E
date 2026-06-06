import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/veefore');
    const { SocialAccountModel } = await import('./models/Social/SocialAccount');
    const accounts = await SocialAccountModel.find({}).lean();
    console.log(JSON.stringify(accounts.map((a: any) => ({ id: a._id, accountId: a.accountId, pageId: a.pageId, platform: a.platform, isActive: a.isActive, username: a.username })), null, 2));
  } catch(e) {
    console.error(e);
  } finally {
    mongoose.disconnect();
    process.exit(0);
  }
}
run();
