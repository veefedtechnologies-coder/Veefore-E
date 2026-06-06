import mongoose from 'mongoose';
import { AnalyticsService } from './server/services/AnalyticsService';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
  
  const workspaceId = "684402c2fd2cd4eb6521b386";
  
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);
  
  const { analyticsService } = await import('./server/services');
  const month = await analyticsService.getAnalyticsByDateRange({
    workspaceId,
    startDate,
    endDate
  });
  console.log("MONTH RECORDS COUNT:", month.length);
  if(month.length > 0) {
      console.log("FIRST:", month[0].date, "Followers:", month[0].followers, "Likes:", month[0].likes, "Views:", month[0].views);
      console.log("LAST:", month[month.length-1].date, "Followers:", month[month.length-1].followers, "Likes:", month[month.length-1].likes, "Views:", month[month.length-1].views);
  }
  
  process.exit(0);
}
run().catch(console.error);
