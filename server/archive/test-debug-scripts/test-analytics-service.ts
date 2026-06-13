import { AnalyticsService } from './services/AnalyticsService';
import mongoose from 'mongoose';

async function run() {
  const uri = "mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
  await mongoose.connect(uri);
  
  const analyticsService = new AnalyticsService();
  const workspaceId = "684402c2fd2cd4eb6521b386";
  
  console.log("Calling getFollowerAnalytics for week...");
  const weekData = await analyticsService.getFollowerAnalytics(workspaceId, 'week');
  console.log("Week data:", weekData);
  
  console.log("Calling getFollowerAnalytics for day...");
  const dayData = await analyticsService.getFollowerAnalytics(workspaceId, 'day');
  console.log("Day data:", dayData);

  console.log("Calling getFollowerAnalytics for month...");
  const monthData = await analyticsService.getFollowerAnalytics(workspaceId, 'month');
  console.log("Month data:", monthData);
  
  await mongoose.disconnect();
}
run().catch(console.error);
