import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
async function run() {
  await mongoose.connect(process.env.MONGODB_URI!, { dbName: process.env.MONGODB_DB_NAME || 'veeforedb' });
  const rows = await mongoose.connection.db!.collection('analyticsdailymetrics').find(
    { workspaceId: '686d98d74888852d5d7beb75', metricGroup: 'insights' },
    { projection: { date: 1, values: 1 } }
  ).sort({ date: -1 }).limit(5).toArray();
  rows.forEach((r: any) => {
    console.log(r.date, JSON.stringify(r.values));
  });
  await mongoose.disconnect();
  process.exit(0);
}
run().catch(e => { console.error(e.message); process.exit(1); });
