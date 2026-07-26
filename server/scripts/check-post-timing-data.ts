import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI!, { dbName: process.env.MONGODB_DB_NAME || 'veeforedb' });

  const count = await mongoose.connection.db!.collection('contents').countDocuments({
    workspaceId: '686d98d74888852d5d7beb75', platform: 'instagram',
    publishedAt: { $exists: true, $ne: null }
  });
  console.log('Posts with publishedAt:', count);

  const posts = await mongoose.connection.db!.collection('contents').find(
    { workspaceId: '686d98d74888852d5d7beb75', platform: 'instagram', publishedAt: { $exists: true, $ne: null } },
    { projection: { publishedAt: 1, 'metrics.reach': 1, 'metrics.impressions': 1, 'metrics.views': 1, 'metrics.likes': 1, 'metrics.comments': 1, 'metrics.engagement': 1 } }
  ).limit(5).toArray();

  posts.forEach((p: any) => {
    const date = new Date(p.publishedAt);
    const dow = date.getDay();
    const hour = date.getHours();
    console.log(`  DOW:${dow} H:${hour} | reach:${p.metrics?.reach} imp:${p.metrics?.impressions} views:${p.metrics?.views} likes:${p.metrics?.likes} eng:${p.metrics?.engagement}`);
  });

  await mongoose.disconnect();
  process.exit(0);
}
run().catch(e => { console.error(e.message); process.exit(1); });
