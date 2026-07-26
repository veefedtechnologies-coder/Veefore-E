import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
async function run() {
  await mongoose.connect(process.env.MONGODB_URI!, { dbName: process.env.MONGODB_DB_NAME || 'veeforedb' });
  const last30 = new Date(Date.now() - 30*24*60*60*1000);
  // Per-day insights store
  const rows = await mongoose.connection.db!.collection('analyticsdailymetrics').aggregate([
    { $match: { workspaceId: '686d98d74888852d5d7beb75', metricGroup: 'insights', date: { $gte: last30.toISOString().slice(0,10) } } },
    { $group: { _id: null, saves: { $sum: '$values.saves' }, reach: { $sum: '$values.reach' } } }
  ]).toArray();
  console.log('Insights store last 30d → saves:', rows[0]?.saves, '| reach:', rows[0]?.reach);
  await mongoose.disconnect();
  process.exit(0);
}
run().catch(e => { console.error(e.message); process.exit(1); });
