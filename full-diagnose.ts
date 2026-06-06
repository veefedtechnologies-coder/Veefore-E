import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

async function diagnose() {
  await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
  
  const workspaceId = '684402c2fd2cd4eb6521b386';

  // Check SocialAccount status fields
  const SocialSchema = new mongoose.Schema({}, { strict: false });
  const SocialModel = mongoose.model('SocialAccount', SocialSchema, 'socialaccounts');
  const social = await SocialModel.find({ workspaceId });
  
  console.log('\n=== ALL SOCIAL ACCOUNT FIELDS ===');
  social.forEach(r => {
    const obj = r.toObject();
    const keys = ['username', 'platform', 'status', 'isActive', 'connectionStatus', 'tokenStatus', 'followersCount', 'mediaCount'];
    keys.forEach(k => console.log(`  ${k}: ${obj[k]}`));
  });
  
  // Check what findActiveByWorkspace would return
  // Looking at the query it uses
  const AnalyticsSchema = new mongoose.Schema({}, { strict: false });
  const AnalyticsModel = mongoose.model('Analytics', AnalyticsSchema);
  
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);
  
  console.log('\n=== ANALYTICS QUERY (last 30 days) ===');
  const records = await AnalyticsModel.find({
    workspaceId,
    date: { $gte: startDate, $lte: endDate }
  }).sort({ date: 1 });
  
  console.log('Records found:', records.length);
  records.forEach(r => console.log(
    '  date:', r.get('date')?.toISOString().split('T')[0],
    '| followers:', r.get('followers'),
    '| platform:', r.get('platform')
  ));
  
  process.exit(0);
}
diagnose().catch(e => { console.error(e); process.exit(1); });
