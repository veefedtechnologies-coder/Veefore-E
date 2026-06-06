import mongoose from 'mongoose';
import axios from 'axios';
import 'dotenv/config';

async function fetchInsights() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  console.log('Connected to DB');

  const db = mongoose.connection.db;
  if (!db) return;
  const account = await db.collection('socialaccounts').findOne({ platform: 'instagram' });
  if (!account) return console.log('No account found');

  const accountId = account.accountId;
  const accessToken = account.accessToken;
  const workspaceId = account.workspaceId;

  console.log(`Found account ${accountId} in workspace ${workspaceId}`);
  
  try {
    const { InstagramApiService } = require('./server/services/instagramApi');
    console.log('Fetching insights...');
    const result = await InstagramApiService.getBatchAccountInsights(accountId, accessToken);
    console.log('Success! Account Info Name:', result.account?.name);
    console.log('Insights:', result.insights);
  } catch (e: any) {
    console.error('ERROR during getBatchAccountInsights:', e.message);
    if (e.response) {
      console.error('Axios Response:', e.response.data);
    }
  }
  
  process.exit(0);
}

fetchInsights();
