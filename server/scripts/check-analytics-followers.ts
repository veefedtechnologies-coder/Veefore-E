import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' }).then(async () => {
  const { AnalyticsModel } = await import('../models/Analytics/Analytics');
  const a = await AnalyticsModel.find({}).sort({ date: -1 }).limit(5);
  for (const doc of a) {
    console.log(`Analytics ${doc.date}: followers=${doc.followers}, likes=${doc.likes}, views=${doc.views}`);
  }
  process.exit(0);
});
