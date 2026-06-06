const { MongoClient } = require('mongodb');
require('dotenv').config();

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db('veefore');
  const accounts = await db.collection('socialaccounts').find({ platform: 'instagram' }).toArray();
  for (const acc of accounts) {
    console.log("Account:", acc._id, "Username:", acc.username, "Token:", acc.accessToken ? acc.accessToken.substring(0, 10) + "..." : "missing", "Encrypted:", acc.encryptedAccessToken ? "exists" : "missing");
  }
  await client.close();
}
run();
