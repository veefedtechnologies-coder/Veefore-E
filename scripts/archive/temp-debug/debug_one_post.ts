import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import axios from 'axios';
import { SocialAccountModel } from './server/models/Social/SocialAccount';

dotenv.config();

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI!, { dbName: 'veeforedb' });
    const account = await SocialAccountModel.findOne({ platform: 'instagram' });
    if (!account) return;

    const token = account.accessToken;
    const accountId = account.accountId;
    
    // Get one media ID
    const mediaUrl = `https://graph.facebook.com/v22.0/${accountId}/media?fields=id,media_type&access_token=${token}&limit=1`;
    const mediaResp = await axios.get(mediaUrl);
    const mediaId = mediaResp.data.data[0]?.id;
    const type = mediaResp.data.data[0]?.media_type;

    if (!mediaId) return;

    console.log('Post ID:', mediaId, 'Type:', type);
    
    const insightsUrl = `https://graph.facebook.com/v22.0/${mediaId}/insights?metric=reach,impressions,saved&access_token=${token}`;
    const insightsResp = await axios.get(insightsUrl);
    console.log('Insights Response:', JSON.stringify(insightsResp.data, null, 2));

  } catch (e: any) {
    console.error('Error:', e.response?.data || e.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

run();
