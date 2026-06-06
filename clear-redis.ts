import { CachingSystem } from './server/performance/caching-system';
import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

async function clear() {
  try {
    await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
    console.log('Connected to MongoDB');
    
    // Initialize cache and wait a bit for Redis
    await CachingSystem.initialize();
    
    // Wait for 2 seconds to ensure Redis connection is fully established
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    try {
      await CachingSystem.invalidateByTag('dashboard');
      console.log('Cleared dashboard cache');
    } catch(e) { console.error('Error clearing dashboard', e); }
    
    try {
      await CachingSystem.invalidateByTag('social_accounts');
      console.log('Cleared social_accounts cache');
    } catch(e) { console.error('Error clearing social_accounts', e); }
    
    try {
      await CachingSystem.invalidateByTag('historical');
      console.log('Cleared historical cache');
    } catch(e) { console.error('Error clearing historical', e); }
    
    console.log('Cache invalidated manually');
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
clear();
