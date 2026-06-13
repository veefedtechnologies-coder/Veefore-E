import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

const AnalyticsSchema = new mongoose.Schema({}, { strict: false });
const AnalyticsModel = mongoose.model('Analytics', AnalyticsSchema);

async function fix() {
  await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
  
  const workspaceId = '684402c2fd2cd4eb6521b386';
  
  // Yesterday should be the "baseline" — set it to 456 (when user had 456 followers)
  // Today should be 455 (after one follower unfollowed)
  const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const todayStr = new Date().toISOString().split('T')[0];
  
  console.log('Setting up correct records:');
  console.log('  Yesterday (', yesterdayStr, '): followers = 456 (baseline when account was connected)');
  console.log('  Today (', todayStr, '): followers = 455 (after 1 unfollow) — this is today\'s START of day baseline');
  
  // Fix yesterday's record back to 456 (the true baseline at the start of the month)
  const yesterdayResult = await AnalyticsModel.findOneAndUpdate(
    { workspaceId, platform: 'instagram', date: { $gte: new Date(yesterdayStr), $lt: new Date(new Date(yesterdayStr).getTime() + 86400000) } },
    { $set: { followers: 456 } },
    { new: true }
  );
  
  console.log('Yesterday record updated: followers=', yesterdayResult?.get('followers'));
  
  // Keep today's record at 455
  const todayResult = await AnalyticsModel.findOne({ 
    workspaceId, platform: 'instagram',
    date: { $gte: new Date(todayStr), $lt: new Date(new Date(todayStr).getTime() + 86400000) }
  });
  console.log('Today record (unchanged): followers=', todayResult?.get('followers'));
  
  console.log('\nNew delta (live 455 - oldest baseline 456):', 455 - 456, '→ Should show -1 Monthly New Followers');
  
  process.exit(0);
}
fix().catch(e => { console.error(e); process.exit(1); });
