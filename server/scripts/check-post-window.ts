import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
async function run() {
  await mongoose.connect(process.env.MONGODB_URI!, { dbName: process.env.MONGODB_DB_NAME || 'veeforedb' });
  const now = new Date();
  const since30 = new Date(now.getTime() - 30*24*60*60*1000);
  const since90 = new Date(now.getTime() - 90*24*60*60*1000);
  const c30 = await mongoose.connection.db!.collection('contents').countDocuments({ workspaceId: '686d98d74888852d5d7beb75', platform: 'instagram', publishedAt: { $gte: since30 } });
  const c90 = await mongoose.connection.db!.collection('contents').countDocuments({ workspaceId: '686d98d74888852d5d7beb75', platform: 'instagram', publishedAt: { $gte: since90 } });
  console.log('Posts in last 30 days:', c30);
  console.log('Posts in last 90 days:', c90);
  await mongoose.disconnect();
  process.exit(0);
}
run().catch(e => { console.error(e.message); process.exit(1); });
