import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import axios from 'axios';
dotenv.config({ path: '../.env' });

async function run() {
  let mongoUri = process.env.MONGODB_URI || '';
  if (!mongoUri.startsWith('mongodb://') && !mongoUri.startsWith('mongodb+srv://')) {
      mongoUri = `mongodb+srv://${process.env.MONGODB_USER}:${process.env.MONGODB_PASSWORD}@${process.env.MONGODB_HOST}/${process.env.MONGODB_DATABASE}?retryWrites=true&w=majority`;
  }
  await mongoose.connect(mongoUri);
  
  const WorkspacePlatform = mongoose.connection.collection('workspace_platforms');
  const platform = await WorkspacePlatform.findOne({ platform: 'instagram', isActive: true });
  if (!platform) {
    console.log("No active instagram platform found");
    process.exit(0);
  }

  const accountId = platform.accountId;
  const token = platform.accessToken;
  console.log('Testing account:', accountId);

  const url1 = `https://graph.facebook.com/v22.0/${accountId}/insights?metric=reach&period=day&access_token=${token}`;
  try {
     const res1 = await axios.get(url1);
     console.log('Reach Day:', JSON.stringify(res1.data, null, 2));
  } catch (e: any) {
     console.log('Error Day:', e.response?.data || e.message);
  }

  const url2 = `https://graph.facebook.com/v22.0/${accountId}/insights?metric=reach&period=week&access_token=${token}`;
  try {
     const res2 = await axios.get(url2);
     console.log('Reach Week:', JSON.stringify(res2.data, null, 2));
  } catch (e: any) {
     console.log('Error Week:', e.response?.data || e.message);
  }

  process.exit(0);
}
run();
