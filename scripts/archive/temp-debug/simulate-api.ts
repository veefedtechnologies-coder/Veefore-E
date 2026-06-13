import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

async function simulateAPI() {
  await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
  
  const workspaceId = '684402c2fd2cd4eb6521b386';
  const AnalyticsModel = mongoose.model('Analytics', new mongoose.Schema({}, { strict: false }));
  const SocialModel = mongoose.model('SocialAccount', new mongoose.Schema({}, { strict: false }), 'socialaccounts');
  
  // Simulate what /api/analytics/historical?period=month&days=30 does
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);
  
  console.log('Query startDate:', startDate.toISOString());
  console.log('Query endDate:', endDate.toISOString());
  
  // Step 1: findActiveByWorkspace
  const activeAccounts = await SocialModel.find({ workspaceId, isActive: true });
  const activePlatforms = activeAccounts.map((a: any) => a.get('platform'));
  console.log('Active platforms:', activePlatforms);
  
  // Step 2: findByWorkspaceAndDateRange
  const records = await AnalyticsModel.find({
    workspaceId,
    platform: { $in: activePlatforms },
    date: { $gte: startDate, $lte: endDate }
  }).sort({ date: 1 });
  
  console.log('\nRecords returned by API query:', records.length);
  records.forEach(r => {
    console.log('  date:', r.get('date')?.toISOString().split('T')[0], '| followers:', r.get('followers'));
  });
  
  // Step 3: What the frontend calculates
  const liveFollowers = activeAccounts[0]?.get('followersCount') || 0;
  const oldestFollowers = records.length > 0 ? records[0].get('followers') : 0;
  
  console.log('\nFrontend calculation:');
  console.log('  totalFollowersBase (live):', liveFollowers);
  console.log('  oldestRecord.followers:', oldestFollowers);
  console.log('  followerGains =', liveFollowers, '-', oldestFollowers, '=', liveFollowers - oldestFollowers);
  
  process.exit(0);
}
simulateAPI().catch(e => { console.error(e); process.exit(1); });
