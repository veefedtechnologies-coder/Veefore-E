import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db('test');
  const account = await db.collection('socialaccounts').findOne({ platform: 'instagram' });
  console.log("account keys:", Object.keys(account));
  console.log("accessToken type:", typeof account.accessToken);
  console.log("accessToken value:", account.accessToken);
  console.log("encryptedAccessToken type:", typeof account.encryptedAccessToken);
  console.log("encryptedAccessToken value:", account.encryptedAccessToken);
  await client.close();
}
run();
