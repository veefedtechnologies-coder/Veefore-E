import mongoose from 'mongoose';
import { tokenEncryption } from './server/security/token-encryption';
import InstagramApiService from './server/services/instagramApi';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI!, { dbName: 'veeforedb' });
    const account = await mongoose.connection.collection('socialaccounts').findOne({ username: 'arpit.10' });
    const token = tokenEncryption.decryptToken(account!.encryptedAccessToken);
    
    console.log('Simulating sync for arpit.10');
    const data = await InstagramApiService.getRecentMediaWithInsights(token, account!.accountId, 5);
    
    console.log(`Fetched ${data.length} posts with insights simulation`);
    data.forEach(p => {
      console.log(`Post ${p.id} [Type: ${p.media_type}] Insights:`, JSON.stringify(p.insights));
    });

  } catch (e: any) {
    console.error('Error:', e.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}
run();
