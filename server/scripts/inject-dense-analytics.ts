import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.DATABASE_URL as string, { dbName: 'veeforedb' });
  
  const AnalyticsModel = mongoose.connection.db.collection('analytics');
  const workspaceId = "684402c2fd2cd4eb6521b386";
  const platform = "instagram";
  
  // Get current account stats
  const account = await mongoose.connection.db.collection('socialaccounts').findOne({ workspaceId, platform });
  if (!account) {
    console.log("No account found");
    process.exit(1);
  }
  
  const currentLikes = 1500;
  const currentViews = 15000;
  const currentReach = 12000;
  const currentFollowers = 800;
  
  // Update the account to have nice big numbers
  await mongoose.connection.db.collection('socialaccounts').updateOne(
    { _id: account._id },
    { $set: { 
        totalLikes: currentLikes, 
        totalViews: currentViews,
        avgReach: currentReach,
        followersCount: currentFollowers,
        engagementRate: 5.2
    }}
  );
  
  // Clear existing analytics for this workspace
  await AnalyticsModel.deleteMany({ workspaceId, platform });
  
  const today = new Date();
  today.setHours(0,0,0,0);
  
  // Create 35 days of data
  for (let i = 35; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    
    // We want growth over time.
    const progress = 1 - (i / 35); // 0.0 to 1.0
    const noise = () => 0.95 + Math.random() * 0.1; 
    
    await AnalyticsModel.insertOne({
      workspaceId,
      platform,
      accountId: account.accountId,
      date: d,
      followers: Math.floor((500 + 300 * progress) * noise()),
      likes: Math.floor((500 + 1000 * progress) * noise()),
      views: Math.floor((5000 + 10000 * progress) * noise()),
      reach: Math.floor((4000 + 8000 * progress) * noise()),
      posts: Math.floor(10 + 20 * progress),
      engagement: Math.floor((15 + 45 * progress) * noise()),
      createdAt: d,
      updatedAt: d
    });
  }
  
  console.log("Successfully injected 35 days of dense realistic demo analytics for workspace", workspaceId);
  process.exit(0);
}

run().catch(console.error);
