import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' }).then(async () => {
  const { AnalyticsModel } = await import('../models/Analytics/Analytics');
  
  const analytics = await AnalyticsModel.find({ views: { $gt: 0 }, viewsDay: { $exists: false } });
  for (const a of analytics) {
    a.viewsDay = a.views;
    a.viewsWeek = a.views;
    a.viewsDays28 = a.views;
    await a.save();
    console.log(`Updated Analytics for ${a.accountId} date ${a.date}`);
  }
  
  // also fix where viewsDay == 0 but views > 0
  const analyticsZero = await AnalyticsModel.find({ views: { $gt: 0 }, viewsDay: 0 });
  for (const a of analyticsZero) {
    a.viewsDay = a.views;
    a.viewsWeek = a.views;
    a.viewsDays28 = a.views;
    await a.save();
    console.log(`Fixed zero Analytics for ${a.accountId} date ${a.date}`);
  }
  
  process.exit(0);
});
