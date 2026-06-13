import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db('veeforedb');
  const account = await db.collection('socialaccounts').findOne({ workspaceId: '684402c2fd2cd4eb6521b386', platform: 'instagram' });
  console.log("Account:", account._id);
  console.log("accountId:", account.accountId);
  console.log("pageId:", account.pageId);
  await client.close();
}
run();
