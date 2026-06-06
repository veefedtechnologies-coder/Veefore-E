import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

async function test() {
  try {
    const { analyticsService } = await import('./server/services/AnalyticsService');
    await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
    const workspaceId = '684402c2fd2cd4eb6521b386'; 
    const result = await analyticsService.getPerformanceSummary(workspaceId, 30);
    console.log('Followers:', result.followers);
    console.log('GrowthDelta:', result.growthDelta);
    console.log('Overview:', JSON.stringify(result.overview, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
test();
