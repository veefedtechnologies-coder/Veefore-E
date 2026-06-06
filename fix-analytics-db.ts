import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

// Pre-register models
import './server/models/Social';
import { AnalyticsModel } from './server/models/Analytics/Analytics';

async function run() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  console.log("Connected to Mongoose!");
  
  const workspaceId = '684402c2fd2cd4eb6521b386';
  
  // Reset likes, comments, shares, views, reach to 0 for all records to clean up the corrupted snapshots
  const result = await AnalyticsModel.updateMany(
    { workspaceId },
    { $set: { likes: 0, comments: 0, shares: 0, views: 0, reach: 0, reachDay: 0, reachWeek: 0, reachDays28: 0, viewsDay: 0, viewsWeek: 0, viewsDays28: 0 } }
  );
  
  console.log(`Reset metrics for ${result.modifiedCount} records.`);
  
  process.exit(0);
}
run();
