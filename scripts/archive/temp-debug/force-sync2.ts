import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '.env') });

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
  const updated = await socialAccountService.syncAccount(account._id.toString(), {
    metricsType: 'all',
    forceRefresh: true
  });
  
  console.log("SYNCED! Followers:", updated.followersCount, "Likes:", updated.totalLikes, "Views:", updated.totalViews, "Reach:", updated.totalReach);
  process.exit(0);
}

run().catch(console.error);
