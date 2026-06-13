import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import { ObjectId } from 'mongodb';
dotenv.config();

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db('veeforedb');
  const content = await db.collection('contents').findOne({ _id: new ObjectId('6a1474871f25f885314aa667') });
  console.log("Content workspaceId:", content?.workspaceId);
  const account = await db.collection('socialaccounts').findOne({ workspaceId: content?.workspaceId, platform: 'instagram' });
  console.log("Account:", account?._id);
  console.log("Account plain access token:", account?.accessToken);
  console.log("Account encrypted access token exists:", !!account?.encryptedAccessToken);
  await client.close();
}
run();
