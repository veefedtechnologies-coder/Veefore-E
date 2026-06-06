import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' }).then(async () => {
  const { AnalyticsModel } = await import('../models/Analytics/Analytics');
  
  const analytics = await AnalyticsModel.find({ views: { $gt: 0 } });
  for (const a of analytics) {
    if (!a.viewsDay || a.viewsDay === 0) {
        a.viewsDay = a.views;
        a.viewsWeek = a.views;
        a.viewsDays28 = a.views;
        await a.save();
        console.log(`Updated Analytics for ${a.accountId} date ${a.date}`);
    }
  }
  process.exit(0);
});
