import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

const { analyticsRepository } = require('./server/repositories/AnalyticsRepository');

async function test() {
  try {
    await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    
    const workspaceId = '684402c2fd2cd4eb6521b386'; // from previous output
    const data = await analyticsRepository.getDailyMetrics(workspaceId, startDate, endDate, ['instagram']);
    console.log(data);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
test();
