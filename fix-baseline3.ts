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

async function check() {
  try {
    await mongoose.connect(process.env.MONGODB_URI as string);
    const records = await AnalyticsModel.find({ platform: 'instagram' }).sort({ date: -1 }).limit(5);
    console.log(records);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
check();
