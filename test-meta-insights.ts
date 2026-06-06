import { MongoClient } from 'mongodb';
import axios from 'axios';
import dotenv from 'dotenv';
import { getAccessTokenFromAccount } from './server/storage/converters';
dotenv.config();

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI as string);
  try {
    await client.connect();
    const db = client.db('veeforedb');
    const acc = await db.collection('socialaccounts').findOne({ username: 'rahulc1020' });
    const token = getAccessTokenFromAccount(acc as any);
    const accountId = acc?.accountId;
    
    try {
      const res = await axios.get(`https://graph.facebook.com/v22.0/${accountId}/insights?metric=views&period=day&metric_type=total_value&access_token=${token}`);
      console.log("Views with total_value:", JSON.stringify(res.data, null, 2));
    } catch (e: any) { console.error("Views error:", e.response?.data || e.message); }

  } finally {
    await client.close();
  }
}
run().catch(console.error);
