import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function checkLatestPost() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || '');

    const posts = mongoose.connection.db.collection('posts');
    const latestPosts = await posts.find({}).sort({ createdAt: -1 }).limit(5).toArray();
    
    console.log('\n--- LATEST POSTS ---');
    latestPosts.forEach((p: any) => {
        console.log(`Post ID: ${p._id}, Status: ${p.status}, Type: ${p.postType}, Platform: ${p.platform}, CreatedAt: ${p.createdAt}`);
        if (p.error) console.log(`  Error: ${JSON.stringify(p.error)}`);
        if (p.mediaUrls) console.log(`  MediaUrls: ${JSON.stringify(p.mediaUrls)}`);
    });

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.disconnect();
  }
}

checkLatestPost();
