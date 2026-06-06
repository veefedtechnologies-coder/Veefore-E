import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

async function check() {
  await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
  const AnalyticsModel = mongoose.model('Analytics', new mongoose.Schema({}, { strict: false }));
  
  const records = await AnalyticsModel.find({ workspaceId: '684402c2fd2cd4eb6521b386' }).sort({ date: 1 });
  records.forEach(r => {
    const obj = r.toObject();
    console.log('_id:', obj._id, '| date:', obj.date?.toISOString(), '| followers:', obj.followers, '| posts:', obj.posts, '| updatedAt:', obj.updatedAt?.toISOString());
  });
  process.exit(0);
}
check().catch(e => { console.error(e); process.exit(1); });
