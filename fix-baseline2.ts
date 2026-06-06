import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

const AnalyticsSchema = new mongoose.Schema({
  workspaceId: String,
  platform: String,
  date: Date,
  followers: Number,
}, { strict: false });
const AnalyticsModel = mongoose.model('Analytics', AnalyticsSchema);

async function fix() {
  try {
    await mongoose.connect(process.env.MONGODB_URI as string);
    const record = await AnalyticsModel.findOne({ platform: 'instagram' }).sort({ date: -1 });
    if (record) {
      console.log('Current baseline followers:', record.followers, 'Date:', record.date);
      record.followers = 455;
      await record.save();
      console.log('Fixed baseline to 455.');
    } else {
      console.log('No record found');
    }
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
fix();
