import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' }).then(async () => {
  const { SocialAccountModel } = await import('../models/Social/SocialAccount');
  const accounts = await SocialAccountModel.find({ platform: 'instagram' });
  for (const acc of accounts) {
    console.log(`Account ${acc.username}: followersCount=${acc.followersCount}, followers=${(acc as any).followers}`);
  }
  process.exit(0);
});
