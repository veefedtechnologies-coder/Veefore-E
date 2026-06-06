import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

async function test() {
  try {
    await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
    console.log('Connected to Mongoose properly!');
    
    // Now import
    const { analyticsService } = await import('./server/services/AnalyticsService.ts');
    const workspaceId = '684402c2fd2cd4eb6521b386'; 
    const result = await analyticsService.getPerformanceSummary(workspaceId, 30);
    console.log('Followers:', result.followers);
    console.log('GrowthDelta:', result.growthDelta);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
test();
