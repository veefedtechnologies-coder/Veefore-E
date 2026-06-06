import mongoose from 'mongoose';
import { AnalyticsService } from './server/services/AnalyticsService';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
  const { analyticsService } = await import('./server/services');
  
  const workspaceId = "684402c2fd2cd4eb6521b386";
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);
  
  const data = await analyticsService.getAnalyticsByDateRange({
    workspaceId,
    startDate,
    endDate
  });
  console.log("RECORDS:", data.length);
  if(data.length > 0) {
      console.log("FIRST:", { date: data[0].date, likes: data[0].likes, followers: data[0].followers });
      console.log("LAST:", { date: data[data.length-1].date, likes: data[data.length-1].likes, followers: data[data.length-1].followers });
  }
  process.exit(0);
}
run().catch(console.error);
