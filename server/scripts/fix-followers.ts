import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' }).then(async () => {
  const { AnalyticsModel } = await import('../models/Analytics/Analytics');
  const { SocialAccountModel } = await import('../models/Social/SocialAccount');
  
  const accounts = await SocialAccountModel.find({ platform: 'instagram' });
  for (const acc of accounts) {
    const followerCount = acc.followersCount || acc.followers || 0;
    
    // Update all analytics to match the current followers if there is a massive discrepancy
    const analytics = await AnalyticsModel.find({ accountId: acc.accountId });
    for (const a of analytics) {
      if (a.followers !== followerCount) {
        a.followers = followerCount;
        await a.save();
        console.log(`Updated Analytics followers for ${acc.username} to ${followerCount}`);
      }
    }
  }
  process.exit(0);
});
