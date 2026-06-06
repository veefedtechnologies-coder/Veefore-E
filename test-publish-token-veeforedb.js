import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db('veeforedb');
  const accounts = await db.collection('socialaccounts').find({ platform: 'instagram' }).toArray();
  for (const account of accounts) {
    if (account.workspaceId === '6a1474871f25f885314aa667' || account.workspaceId === '684402c2fd2cd4eb6521b386') {
      console.log("Account:", account._id, "workspace:", account.workspaceId);
      console.log("encryptedAccessToken:", account.encryptedAccessToken);
      console.log("accessToken:", account.accessToken);
    }
  }
  await client.close();
}
run();
