import { SocialAccountService } from './server/services/SocialAccountService';
import database from './server/mongodb';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  await database.connect();
  const db = database.getDb();
  const account = await db.collection('socialaccounts').findOne({ workspaceId: '684402c2fd2cd4eb6521b386' });
  
  if (account) {
    const { InstagramApiService } = await import('./server/services/instagramApi');
    const data = await InstagramApiService.getComprehensiveMetrics(account.accessToken, account.accountId, { fetchInsights: true, fetchMedia: false });
    console.log(JSON.stringify(data.insights, null, 2));
  } else {
    console.log("no account");
  }
  await database.disconnect();
}
run().catch(console.error);
