import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db('veefore');
  const accounts = await db.collection('socialaccounts').find({ platform: 'instagram' }).toArray();
  for (const account of accounts) {
    console.log("Account:", account._id, "workspace:", account.workspaceId);
  }
  await client.close();
}
run();
