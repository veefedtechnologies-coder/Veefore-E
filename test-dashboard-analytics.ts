import { AnalyticsRepository } from './server/repositories/AnalyticsRepository';
import { AnalyticsModel } from './server/models/Analytics';
import { MongoClient } from 'mongodb';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  
  const repo = new AnalyticsRepository(AnalyticsModel);
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 90);
  
  const workspaceId = '684402c2fd2cd4eb6521b386';
  
  const res = await repo.getAggregatedMetrics(workspaceId, startDate, endDate, ['instagram']);
  console.log("Aggregated Metrics for 90d:", res);
  
  await mongoose.disconnect();
}

run().catch(console.error);
