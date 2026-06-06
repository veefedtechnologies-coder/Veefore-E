import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

const AnalyticsSchema = new mongoose.Schema({}, { strict: false });
const AnalyticsModel = mongoose.model('Analytics', AnalyticsSchema);

async function check() {
  try {
    await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
    const records = await AnalyticsModel.find({ platform: 'instagram' }).sort({ date: 1 });
    console.log('All Records:');
    records.forEach(r => console.log(r._id, 'date:', r.get('date'), 'followers:', r.get('followers')));
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
check();
