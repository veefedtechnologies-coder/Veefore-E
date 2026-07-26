import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI!, { dbName: 'veeforedb' });
  const snapshots = await mongoose.connection.collection('instagramfollowersnapshots').find({}).sort({ snapshotDate: 1 }).toArray();
  console.log('Total snapshots:', snapshots.length);
  for (const s of snapshots) {
    console.log(new Date(s.snapshotDate).toISOString().split('T')[0], '| followers:', s.followerCount, '| account:', s.accountId);
  }
  
  // Also check what the analytics service would return
  const account = await mongoose.connection.collection('socialaccounts').findOne({ platform: 'instagram', isActive: true });
  console.log('\nAccount followersCount stored in DB:', account?.followersCount);
  console.log('Account _id:', account?._id);
  
  await mongoose.disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
