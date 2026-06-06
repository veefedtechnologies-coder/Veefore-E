import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' }).then(async () => {
  const { AnalyticsModel } = await import('../models/Analytics/Analytics');
  
  const analytics = await AnalyticsModel.find({ accountId: '17841474747481653' }).sort({ date: -1 });
  console.log(JSON.stringify(analytics, null, 2));
  process.exit(0);
});
