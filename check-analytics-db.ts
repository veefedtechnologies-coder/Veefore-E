import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
  const { AnalyticsModel } = await import('./server/models/Analytics/Analytics.js');
  
  const analytics = await AnalyticsModel.find({ workspaceId: "1" }).sort({ date: -1 }).limit(10);
  console.log(`Found ${analytics.length} analytics records.`);
  analytics.forEach((a: any) => {
    console.log(`Date: ${a.date} | viewsDays28: ${a.viewsDays28} | viewsGains: ${a.viewsGains} | views: ${a.views}`);
  });
  
  process.exit(0);
}
run().catch(console.error);
