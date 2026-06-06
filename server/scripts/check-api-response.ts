import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' }).then(async () => {
  const { AnalyticsModel } = await import('../models/Analytics/Analytics');
  
  // Find latest analytics
  const analytics = await AnalyticsModel.find({}).sort({ date: -1 }).limit(1);
  for (const a of analytics) {
    const data = {
        date: a.date || a.createdAt,
        platform: a.platform,
        accountId: a.accountId,
        followers: a.followers || 0,
        likes: a.likes || 0,
        reach: a.reach || 0,
        viewsDay: a.viewsDay || 0,
        viewsWeek: a.viewsWeek || 0,
        viewsDays28: a.viewsDays28 || 0,
        views: a.views || 0,
    };
    console.log(JSON.stringify(data, null, 2));
  }
  process.exit(0);
});
