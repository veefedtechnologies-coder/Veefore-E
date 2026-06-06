import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' }).then(async () => {
  const { AnalyticsModel } = await import('../models/Analytics/Analytics');
  const { SocialAccountModel } = await import('../models/Social/SocialAccount');
  
  const analytics = await AnalyticsModel.find({ accountId: '17841474747481653' }).sort({ date: -1 });
  const acc = await SocialAccountModel.findOne({ accountId: '17841474747481653' });
  const correctFollowers = acc?.followersCount || acc?.followers || 0;
  
  for (const a of analytics) {
     if (a.followers !== correctFollowers) {
        a.followers = correctFollowers;
        await a.save();
        console.log(`Updated followers to ${correctFollowers} for ${a.date}`);
     }
  }
  process.exit(0);
});
