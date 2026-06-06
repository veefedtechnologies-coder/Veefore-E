import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' }).then(async () => {
  const { SocialAccountModel } = await import('../models/Social/SocialAccount');
  const { AnalyticsModel } = await import('../models/Analytics/Analytics');

  const accounts = await SocialAccountModel.find({ platform: 'instagram' });
  console.log(`Found ${accounts.length} total accounts`);
  
  for (const acc of accounts) {
    const latestAnalytics = await AnalyticsModel.findOne({ accountId: acc.accountId }).sort({ date: -1 });
    console.log(`Account ${acc.username}: totalViews=${acc.totalViews}, latestAnalytics views=${latestAnalytics?.views}, viewsDay=${latestAnalytics?.viewsDay}`);
    
    if (latestAnalytics) {
      if (!acc.totalViews && latestAnalytics.views) {
        acc.totalViews = latestAnalytics.views;
        await acc.save();
        console.log(`Updated SocialAccount ${acc.username} totalViews to ${latestAnalytics.views}`);
      }
      
      // Update the viewsDay if missing
      if (!latestAnalytics.viewsDay) {
        latestAnalytics.viewsDay = latestAnalytics.views; // Approximation for first time
        latestAnalytics.viewsWeek = latestAnalytics.views;
        latestAnalytics.viewsDays28 = latestAnalytics.views;
        await latestAnalytics.save();
        console.log(`Updated Analytics ${acc.username} viewsDay to ${latestAnalytics.views}`);
      }
    }
  }
  process.exit(0);
});
