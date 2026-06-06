import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import { InstagramFollowerSnapshotModel } from './models/Analytics';

async function run() {
  const uri = process.env.MONGODB_URI || '';
  await mongoose.connect(uri, { dbName: 'veeforedb', bufferCommands: true });
  console.log('Connected!\n');
  
  // Seed yesterday's snapshot from historical metrics data (we know yesterday had 5 followers)
  const yesterday = new Date();
  yesterday.setUTCHours(0, 0, 0, 0);
  yesterday.setDate(yesterday.getDate() - 1);
  
  const result = await InstagramFollowerSnapshotModel.findOneAndUpdate(
    { 
      accountId: new mongoose.Types.ObjectId('6a2059cc3d64bcca64a7e0e6'), 
      instagramUserId: '17841474747481653', 
      snapshotDate: yesterday 
    },
    { followerCount: 5 },
    { upsert: true, new: true }
  );
  console.log('✅ Seeded yesterday snapshot:', result.snapshotDate, 'followers:', result.followerCount);
  
  // Verify all snapshots
  const all = await InstagramFollowerSnapshotModel.find({}).sort({ snapshotDate: 1 }).lean();
  console.log('\nAll snapshots:', all.length);
  for (const s of all) {
    console.log(`  ${s.snapshotDate} | ${s.followerCount} followers`);
  }
  
  await mongoose.disconnect();
  process.exit(0);
}
run().catch(e => { console.error(e.message); process.exit(1); });
