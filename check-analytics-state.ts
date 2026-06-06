import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

const AnalyticsSchema = new mongoose.Schema({}, { strict: false });
const AnalyticsModel = mongoose.model('Analytics', AnalyticsSchema);
const SocialSchema = new mongoose.Schema({}, { strict: false });
const SocialModel = mongoose.model('SocialAccount', SocialSchema, 'socialaccounts');

async function check() {
  await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
  
  const workspaceId = '684402c2fd2cd4eb6521b386';
  
  console.log('\n=== SOCIAL ACCOUNTS ===');
  const social = await SocialModel.find({ workspaceId });
  social.forEach(r => console.log('  username:', r.get('username'), 'followersCount:', r.get('followersCount'), 'updatedAt:', r.get('updatedAt')));
  
  console.log('\n=== ANALYTICS RECORDS (sorted by date) ===');
  const records = await AnalyticsModel.find({ workspaceId }).sort({ date: 1 });
  records.forEach(r => console.log(
    '  date:', r.get('date').toISOString().split('T')[0],
    '| followers:', r.get('followers'),
    '| posts:', r.get('posts'),
    '| platform:', r.get('platform')
  ));
  
  console.log('\n=== SUMMARY ===');
  console.log('Total analytics records:', records.length);
  if (records.length > 0 && social.length > 0) {
    const oldest = records[0];
    const latest = records[records.length - 1];
    const liveFollowers = social[0]?.get('followersCount') || 0;
    console.log('Oldest record date:', oldest.get('date').toISOString().split('T')[0], '| followers:', oldest.get('followers'));
    console.log('Latest record date:', latest.get('date').toISOString().split('T')[0], '| followers:', latest.get('followers'));
    console.log('Live followersCount from SocialAccount:', liveFollowers);
    console.log('Calculated delta (live - oldest):', liveFollowers - oldest.get('followers'));
  }

  process.exit(0);
}
check().catch(e => { console.error(e); process.exit(1); });
