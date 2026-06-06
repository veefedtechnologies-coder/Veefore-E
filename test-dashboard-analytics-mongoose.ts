import { AnalyticsRepository } from './server/repositories/AnalyticsRepository';
import { AnalyticsModel } from './server/models/Analytics';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  
  const repo = new AnalyticsRepository(AnalyticsModel);
  const endDate = new Date();
  
  const workspaceId = '684402c2fd2cd4eb6521b386';
  
  // Test multiple timeframes
  for (const days of [1]) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    console.log(`\nAggregated Metrics for ${days} days:`);
    try {
      const match: any = {
        workspaceId: workspaceId.toString(),
        date: { $gte: startDate, $lte: endDate }
      };
      const result = await AnalyticsModel.aggregate([
        { $match: match },
        { $sort: { date: 1 } },
        {
          $group: {
            _id: null,
            totalViews: { $sum: '$views' },
            totalLikes: { $sum: '$likes' },
            totalComments: { $sum: '$comments' },
          }
        }
      ]).exec();
      console.log(result);
    } catch (e: any) {
      console.log("Error:", e.message);
    }
  }
  
  await mongoose.disconnect();
}

run().catch(console.error);
