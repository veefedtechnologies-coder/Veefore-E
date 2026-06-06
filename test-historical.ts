import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

async function test() {
  try {
    const { analyticsRepository } = await import('./server/repositories/AnalyticsRepository.ts');
    await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
    const workspaceId = '684402c2fd2cd4eb6521b386'; 
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    const data = await analyticsRepository.getDailyMetrics(workspaceId, startDate, endDate, ['instagram']);
    console.log('Historical Data Length:', data.length);
    if (data.length > 0) {
      console.log('First Record:', data[0]);
    }
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
test();
