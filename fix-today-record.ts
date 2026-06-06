import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

const AnalyticsSchema = new mongoose.Schema({}, { strict: false });
const AnalyticsModel = mongoose.model('Analytics', AnalyticsSchema);

async function fix() {
  await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
  
  const workspaceId = '684402c2fd2cd4eb6521b386';
  const todayStr = new Date().toISOString().split('T')[0]; // 2026-05-24
  
  console.log(`Looking for today's record: ${todayStr}`);
  
  // Find today's record
  const today = await AnalyticsModel.findOne({ 
    workspaceId,
    platform: 'instagram',
    date: { $gte: new Date(todayStr), $lt: new Date(new Date(todayStr).getTime() + 86400000) }
  });
  
  if (!today) {
    console.log('No record found for today. Nothing to fix.');
    process.exit(0);
  }
  
  console.log('Current today record: followers=', today.get('followers'), 'posts=', today.get('posts'));
  
  // Get the live follower count from SocialAccount
  const SocialSchema = new mongoose.Schema({}, { strict: false });
  const SocialModel = mongoose.model('SocialAccount', SocialSchema, 'socialaccounts');
  const social = await SocialModel.findOne({ workspaceId });
  const liveFollowers = social?.get('followersCount') || 455;
  console.log('Live followers from SocialAccount:', liveFollowers);
  
  // Find yesterday's record for posts
  const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const yesterday = await AnalyticsModel.findOne({
    workspaceId,
    platform: 'instagram',
    date: { $gte: new Date(yesterdayStr), $lt: new Date(new Date(yesterdayStr).getTime() + 86400000) }
  });
  
  console.log('Yesterday record: followers=', yesterday?.get('followers'), 'posts=', yesterday?.get('posts'));
  
  // Fix today's record: update followers to live count, posts from yesterday
  const result = await AnalyticsModel.findByIdAndUpdate(
    today._id,
    { 
      $set: { 
        followers: liveFollowers,
        posts: today.get('posts') > 0 ? today.get('posts') : (yesterday?.get('posts') || 0)
      }
    },
    { new: true }
  );
  
  console.log('FIXED today record: followers=', result?.get('followers'), 'posts=', result?.get('posts'));
  console.log('Delta from yesterday (', yesterday?.get('followers'), ') to today (', result?.get('followers'), '):', (result?.get('followers') || 0) - (yesterday?.get('followers') || 0));

  process.exit(0);
}
fix().catch(e => { console.error(e); process.exit(1); });
