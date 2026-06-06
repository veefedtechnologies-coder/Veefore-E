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
    await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Find the latest instagram record
    const records = await AnalyticsModel.find({ platform: 'instagram', date: { $gte: today } }).sort({ date: -1 }).limit(1);
    if (records.length > 0) {
      const record = records[0];
      console.log('Current baseline followers:', record.followers, 'Date:', record.date);
      record.followers = 455;
      await record.save();
      console.log('Fixed baseline to 455. The UI will now show +1 for 456 live followers.');
    } else {
      console.log('No record found for today');
    }
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
fix();
