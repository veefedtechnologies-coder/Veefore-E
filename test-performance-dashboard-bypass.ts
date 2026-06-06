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
  
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 90);
  
  try {
    const res = await repo.getAggregatedMetrics(workspaceId, startDate, endDate, ['instagram']);
    console.log("Repo Result:", res);
  } catch (e: any) {
    console.log("Error:", e.message);
  }
  
  await mongoose.disconnect();
}

run().catch(console.error);
