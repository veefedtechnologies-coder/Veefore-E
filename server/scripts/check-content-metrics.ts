import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
async function run() {
  await mongoose.connect(process.env.MONGODB_URI!, { dbName: process.env.MONGODB_DB_NAME || 'veeforedb' });
  const posts = await mongoose.connection.db!.collection('contents').find(
    { workspaceId: '686d98d74888852d5d7beb75', platform: 'instagram', status: 'published' },
    { projection: { title: 1, type: 1, publishedAt: 1, 'contentData.media_type': 1, metrics: 1 } }
  ).sort({ publishedAt: -1 }).toArray();
  
  console.log(`Total published posts: ${posts.length}`);
  posts.forEach((p: any) => {
    const mediaType = p.contentData?.media_type || p.type || '?';
    console.log(`  [${mediaType}] views:${p.metrics?.views ?? 'none'} reach:${p.metrics?.reach ?? 'none'} likes:${p.metrics?.likes ?? 'none'} | ${p.publishedAt?.toISOString?.()?.slice(0,10) || '?'}`);
  });
  
  await mongoose.disconnect();
  process.exit(0);
}
run().catch(e => { console.error(e.message); process.exit(1); });
