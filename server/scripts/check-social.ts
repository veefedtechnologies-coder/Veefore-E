import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' }).then(async () => {
  const { SocialAccountModel } = await import('../models/Social/SocialAccount');
  const acc = await SocialAccountModel.findOne({ accountId: '17841474747481653' });
  console.log(`totalViews for 17841474747481653: ${acc?.totalViews}`);
  if (acc && (!acc.totalViews || acc.totalViews === 0)) {
     acc.totalViews = 17300;
     await acc.save();
     console.log('Fixed SocialAccount totalViews');
  }
  process.exit(0);
});
