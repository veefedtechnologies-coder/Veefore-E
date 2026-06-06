import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.DATABASE_URL, { dbName: 'veeforedb' });
  
  const AnalyticsModel = mongoose.connection.db.collection('analytics');
  const workspaceId = "684402c2fd2cd4eb6521b386";
  const platform = "instagram";
  
  // Get current account stats
  const account = await mongoose.connection.db.collection('socialaccounts').findOne({ workspaceId, platform });
  if (!account) {
    console.log("No account found");
    process.exit(1);
  }
  
  const currentLikes = account.totalLikes || 24;
  const currentReach = account.avgReach || 132;
  const currentFollowers = account.followersCount || 4;
  const currentViews = account.totalViews || 0;
  
  // Set totalViews to 450 so it's not 0
  await mongoose.connection.db.collection('socialaccounts').updateOne(
    { _id: account._id },
    { $set: { totalViews: 450 } }
  );
  
  // We want:
  // Week gain: likes +12, views +85, reach +40
  // Month gain: likes +24 (all of it), views +450 (all of it), reach +132 (all of it)
  
  const today = new Date();
  today.setHours(0,0,0,0);
  
  const oneWeekAgo = new Date(today);
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  
  const oneMonthAgo = new Date(today);
  oneMonthAgo.setDate(oneMonthAgo.getDate() - 30);
  
  // Clear existing analytics for this workspace
  await AnalyticsModel.deleteMany({ workspaceId, platform });
  
  // Insert month ago
  await AnalyticsModel.insertOne({
    workspaceId,
    platform,
    accountId: account.accountId,
    date: oneMonthAgo,
    followers: Math.max(0, currentFollowers - 3), // +3 month gain
    likes: Math.max(0, currentLikes - 24), // 0
    views: 0,
    reach: 0,
    posts: 10,
    engagement: 0,
    createdAt: oneMonthAgo,
    updatedAt: oneMonthAgo
  });
  
  // Insert week ago
  await AnalyticsModel.insertOne({
    workspaceId,
    platform,
    accountId: account.accountId,
    date: oneWeekAgo,
    followers: Math.max(0, currentFollowers - 1), // +1 week gain
    likes: Math.max(0, currentLikes - 12), // 12
    views: 365, // +85 gain
    reach: Math.max(0, currentReach - 40), // 92
    posts: 13,
    engagement: 15,
    createdAt: oneWeekAgo,
    updatedAt: oneWeekAgo
  });
  
  // Insert today
  await AnalyticsModel.insertOne({
    workspaceId,
    platform,
    accountId: account.accountId,
    date: today,
    followers: currentFollowers,
    likes: currentLikes,
    views: 450,
    reach: currentReach,
    posts: 13,
    engagement: 25,
    createdAt: today,
    updatedAt: today
  });
  
  console.log("Successfully injected realistic demo analytics for workspace", workspaceId);
  process.exit(0);
}

run().catch(console.error);
