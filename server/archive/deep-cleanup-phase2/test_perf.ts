import { MongoClient } from 'mongodb';
import { AnalyticsService } from './services/AnalyticsService.js';
import mongoose from 'mongoose';

async function run() {
  await mongoose.connect('mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0', { dbName: 'veeforedb' });
  const service = new AnalyticsService();
  const summary = await service.getPerformanceSummary('684402c2fd2cd4eb6521b386', 7);
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}

run().catch(console.error);
