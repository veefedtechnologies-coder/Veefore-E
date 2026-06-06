import mongoose from 'mongoose';
import { SocialAccountModel } from './server/models/Social/SocialAccount';
import { fetchInstagramMetrics } from './server/services/instagramApi';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  
  const account = await SocialAccountModel.findOne({ workspaceId: "684402c2fd2cd4eb6521b386", platform: "instagram" });
  if (!account || !account.accessToken) {
    console.log("No account or access token found");
    process.exit(1);
  }
  
  console.log("Fetching account metrics...");
  
  try {
    const metrics = await fetchInstagramMetrics(account.accountId, account.accessToken);
    console.log("METRICS:", metrics);
  } catch(e) {
    console.error(e);
  }
  
  process.exit(0);
}
run().catch(console.error);
