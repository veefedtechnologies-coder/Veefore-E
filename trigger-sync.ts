import { SocialAccountService } from './server/services/SocialAccountService';
import { database } from './server/mongodb-storage';
import dotenv from 'dotenv';
dotenv.config();

// Load models
import './server/models/Social';
import './server/models/Analytics';

async function run() {
  await database.connect();
  console.log("Connected to MongoDB!");
  
  const workspaceId = '684402c2fd2cd4eb6521b386';
  
  const SocialAccountModel = (await import('./server/models/Social/SocialAccount')).SocialAccountModel;
  const account = await SocialAccountModel.findOne({ workspaceId, platform: 'instagram' });
  
  if (!account) {
    console.log("Account not found");
    process.exit(1);
  }
  
  const service = new SocialAccountService();
  await service.syncAccount(account.accountId);
  
  console.log(`Sync completed for ${account.username}.`);
  
  await database.disconnect();
  process.exit(0);
}
run();
