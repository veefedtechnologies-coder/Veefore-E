import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

const AnalyticsSchema = new mongoose.Schema({}, { strict: false });
const AnalyticsModel = mongoose.model('Analytics', AnalyticsSchema);

async function check() {
  try {
    await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const records = await AnalyticsModel.find({ platform: 'instagram', date: { $gte: today } });
    console.log('Records for today:', records.length);
    records.forEach(r => console.log(r._id, 'followers:', r.get('followers')));
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
check();
