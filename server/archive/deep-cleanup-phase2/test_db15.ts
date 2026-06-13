import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config({ path: '../.env' });
import { socialAccountService } from './services';

async function run() {
  let mongoUri = process.env.MONGODB_URI || '';
  if (!mongoUri.startsWith('mongodb://') && !mongoUri.startsWith('mongodb+srv://')) {
      mongoUri = `mongodb+srv://${process.env.MONGODB_USER}:${process.env.MONGODB_PASSWORD}@${process.env.MONGODB_HOST}/${process.env.MONGODB_DATABASE}?retryWrites=true&w=majority`;
  }
  await mongoose.connect(mongoUri, { dbName: 'veeforedb' });
  
  console.log("Triggering sync for 6a2059cc3d64bcca64a7e0e6...");
  try {
     const result = await socialAccountService.syncAccountMetrics('6a2059cc3d64bcca64a7e0e6');
     console.log("Sync complete:", !!result);
  } catch (err: any) {
     console.error("Sync failed:", err.message);
  }
  
  process.exit(0);
}
run();
