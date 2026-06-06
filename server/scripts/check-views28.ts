import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' }).then(async () => {
  const { AnalyticsModel } = await import('../models/Analytics/Analytics');
  const a = await AnalyticsModel.findOne({ accountId: '17841460395358763' }).sort({ date: -1 });
  if (a) {
    console.log(`viewsDays28: ${a.viewsDays28}, viewsWeek: ${a.viewsWeek}, viewsDay: ${a.viewsDay}`);
  } else {
    console.log("No analytics found for rahulc1020");
  }
  process.exit(0);
});
