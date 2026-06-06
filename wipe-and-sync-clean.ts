import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.DATABASE_URL as string, { dbName: 'veeforedb' });
  
  const { socialAccountService } = await import('./server/services/SocialAccountService');
  
  const account = await mongoose.connection.db.collection('socialaccounts').findOne({ 
    workspaceId: "684402c2fd2cd4eb6521b386", 
    platform: "instagram" 
  });
  
  if (!account) {
    console.log("No account found");
    process.exit(1);
  }
  
  console.log("Syncing account ID:", account._id.toString());
  
  // Set real baseline to 0s to wipe out our 1500 mocks before sync
  await mongoose.connection.db.collection('socialaccounts').updateOne(
    { _id: account._id },
    { $set: { totalLikes: 0, totalViews: 0, totalReach: 0, avgReach: 0 } }
  );

  try {
    const updated = await socialAccountService.syncAccount(account._id.toString(), {
      metricsType: 'all',
      forceRefresh: true
    });
    
    console.log("SYNCED REAL DATA! Followers:", updated.followersCount, "Likes:", updated.totalLikes, "Views:", updated.totalViews, "Reach:", updated.totalReach);
  } catch (e) {
    console.error("Sync error:", e);
  }
  
  process.exit(0);
}

run().catch(console.error);
