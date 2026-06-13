import { CachingSystem } from './server/performance/caching-system';
import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

async function clear() {
  try {
    await CachingSystem.initialize();
    await CachingSystem.invalidateByTag('dashboard');
    await CachingSystem.invalidateByTag('social_accounts');
    await CachingSystem.invalidateByTag('historical');
    
    // Or just flush all if possible
    console.log('Cache invalidated manually');
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
clear();
