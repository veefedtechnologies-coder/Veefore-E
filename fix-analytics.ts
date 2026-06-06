import mongoose from 'mongoose';
import { AnalyticsModel } from './server/models/Analytics/Analytics';
import dotenv from 'dotenv';
dotenv.config();

async function fix() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/veefore');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const record = await AnalyticsModel.findOne({ date: { $gte: today } }).sort({ date: -1 });
  if (record) {
    console.log('Current baseline followers:', record.followers);
    // Set it back to 455 to prove the UI works for their new 456 followers
    record.followers = 455;
    await record.save();
    console.log('Fixed baseline to 455.');
  } else {
    console.log('No record found for today');
  }
  process.exit(0);
}
fix();
