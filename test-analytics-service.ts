import { analyticsService } from './server/services';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

// Pre-register models to avoid "schema hasn't been registered" errors
import './server/models/Social';
import './server/models/Analytics';

async function run() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  console.log("Connected to Mongoose!");
  
  const workspaceId = '684402c2fd2cd4eb6521b386';
  
  for (const days of [1, 7, 30]) {
    try {
      console.log(`\nTesting ${days} days...`);
      const summary = await analyticsService.getPerformanceSummary(workspaceId, days);
      console.log(`Overview -> Views: ${summary.overview.totalViews}, Likes: ${summary.overview.totalLikes}, Posts: ${summary.overview.totalPosts}, Reach: ${summary.overview.totalReach}`);
    } catch (e: any) {
      console.log("Error:", e.message);
    }
  }
  
  process.exit(0);
}
run();
