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
    // Manual batch request
    const batchEntries = [
      { method: 'GET', relative_url: `v21.0/${account.accountId}/insights?metric=views&period=day&metric_type=total_value` },
      { method: 'GET', relative_url: `v21.0/${account.accountId}/insights?metric=views&period=week&metric_type=total_value` },
      { method: 'GET', relative_url: `v21.0/${account.accountId}/insights?metric=views&period=days_28&metric_type=total_value` }
    ];
    
    const token = account.accessToken;
    const body = new URLSearchParams();
    body.append('access_token', token);
    body.append('batch', JSON.stringify(batchEntries));
    
    try {
      const fetch = (await import('node-fetch')).default;
      const response = await fetch('https://graph.facebook.com', {
        method: 'POST',
        body: body,
      });
      const data = await response.json();
      
      console.log("DAY:", JSON.parse(data[0].body));
      console.log("WEEK:", JSON.parse(data[1].body));
      console.log("MONTH:", JSON.parse(data[2].body));
      
    } catch(e) {
      console.error(e);
    }
  } else {
    console.log("no account");
  }
  await database.disconnect();
}
run().catch(console.error);
