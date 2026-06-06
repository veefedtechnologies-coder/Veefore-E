import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI || '');
  await client.connect();
  const db = client.db();
  const acc = await db.collection('socialaccounts').findOne({ platform: 'instagram' });
  console.log('DB Engagement Rate:', acc?.engagementRate);
  console.log('Username:', acc?.username);
  await client.close();
}
run().catch(console.error);
