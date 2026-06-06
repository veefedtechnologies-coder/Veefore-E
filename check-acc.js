import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db('test'); // default db in Mongoose URI
  const accounts = await db.collection('socialaccounts').find({ platform: 'instagram' }).toArray();
  for (const acc of accounts) {
    console.log("Account:", acc._id, "Username:", acc.username, "Token:", acc.accessToken ? acc.accessToken.substring(0, 10) + "..." : "missing");
  }
  await client.close();
}
run();
