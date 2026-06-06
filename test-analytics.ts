import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { contentService } from './server/services/ContentService';

dotenv.config();

async function run() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URL || '';
  await mongoose.connect(uri, { dbName: 'veeforedb' });
  console.log('Connected to DB');
  
  try {
    const id = '6a1698e29e597dcfa6184d5c';
    console.log(`Getting analytics for ${id}`);
    const analytics = await contentService.getContentAnalytics(id);
    console.log('Success:', Object.keys(analytics));
  } catch (err: any) {
    console.error('Error:', err.message);
  }
  
  await mongoose.disconnect();
}

run().catch(console.error);
