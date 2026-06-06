import mongoose from 'mongoose';
import { tokenEncryption } from './server/security/token-encryption';
import axios from 'axios';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI!, { dbName: 'veeforedb' });
    const account = await mongoose.connection.collection('socialaccounts').findOne({ username: 'arpit.10' });
    if (!account) { console.log('Account not found'); return; }
    
    const token = tokenEncryption.decryptToken(account.encryptedAccessToken);
    const workspaceId = account.workspaceId;

    const posts = await mongoose.connection.collection('contents').find({ 
      workspaceId: workspaceId, 
      platform: 'instagram'
    }).sort({ publishedAt: -1 }).limit(10).toArray();

    if (posts.length > 0) {
      console.log(`Found ${posts.length} posts for arpit.10`);
      for (const post of posts) {
        const mediaId = post.contentData.id;
        if (!mediaId) continue;
        
        try {
          const url = `https://graph.facebook.com/v22.0/${mediaId}/insights?metric=reach&access_token=${token}`;
          const resp = await axios.get(url);
          const reach = resp.data.data?.[0]?.values?.[0]?.value;
          console.log(`Post ${mediaId}: Reach = ${reach} | Type: ${post.type}`);
        } catch (e: any) {
          console.log(`Post ${mediaId}: Error = ${e.response?.data?.error?.message || e.message}`);
        }
      }
    } else {
      console.log('No posts found for arpit.10');
    }
  } catch (e: any) {
    console.error('Core Error:', e.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}
run();
