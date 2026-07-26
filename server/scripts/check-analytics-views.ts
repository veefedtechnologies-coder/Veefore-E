import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
async function run() {
  await mongoose.connect(process.env.MONGODB_URI!, { dbName: process.env.MONGODB_DB_NAME || 'veeforedb' });
  const last30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const rows = await mongoose.connection.db!.collection('analytics').find(
    { workspaceId: '686d98d74888852d5d7beb75', date: { $gte: last30 } },
    { projection: { date: 1, views: 1, viewsDay: 1, reach: 1 } }
  ).sort({ date: -1 }).limit(10).toArray();
  console.log('Last 30 days Analytics rows with views:');
  rows.forEach((r: any) => {
    console.log(' ', r.date?.toISOString?.()?.slice(0,10), '| views:', r.views, '| viewsDay:', r.viewsDay, '| reach:', r.reach);
  });
  
  // Total views sum
  const agg = await mongoose.connection.db!.collection('analytics').aggregate([
    { $match: { workspaceId: '686d98d74888852d5d7beb75', date: { $gte: last30 } } },
    { $group: { _id: null, totalViews: { $sum: '$views' }, totalViewsDay: { $sum: '$viewsDay' }, count: { $sum: 1 } } }
  ]).toArray();
  console.log('Aggregate:', JSON.stringify(agg[0]));
  
  await mongoose.disconnect();
  process.exit(0);
}
run().catch(e => { console.error(e.message); process.exit(1); });
