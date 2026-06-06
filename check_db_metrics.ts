import mongoose from 'mongoose';
import * as dotenv from 'dotenv';

dotenv.config();

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI!, { dbName: 'veeforedb' });
    console.log('Connected to DB');

    const contents = await mongoose.connection.collection('contents').find({
      platform: 'instagram'
    }).sort({ publishedAt: -1 }).limit(10).toArray();

    console.log('Last 10 Instagram Posts:');
    contents.forEach(post => {
      console.log(`Post: ${post.contentData.id} | Type: ${post.type} | Reach: ${post.metrics?.reach} | Views: ${post.metrics?.views} | Likes: ${post.metrics?.likes}`);
    });

  } catch (e: any) {
    console.error('Error:', e.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

run();
