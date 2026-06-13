import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

const AnalyticsSchema = new mongoose.Schema({}, { strict: false });
const AnalyticsModel = mongoose.model('Analytics', AnalyticsSchema);

async function clean() {
  try {
    await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Find all instagram records for today
    const records = await AnalyticsModel.find({ platform: 'instagram', date: { $gte: today } }).sort({ date: -1 });
    console.log('Found records:', records.map(r => ({ id: r._id, followers: r.get('followers') })));
    
    if (records.length > 1) {
      // Keep the one with 455 followers, delete the rest
      const correctRecord = records.find(r => r.get('followers') === 455) || records[records.length - 1];
      
      for (const record of records) {
        if (record._id.toString() !== correctRecord._id.toString()) {
          console.log('Deleting duplicate record:', record._id, 'with followers:', record.get('followers'));
          await AnalyticsModel.deleteOne({ _id: record._id });
        }
      }
      
      console.log('Cleanup complete. The only record left has followers:', correctRecord.get('followers'));
    } else {
      console.log('Only 1 or 0 records found. No duplicates to clean.');
    }
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
clean();
