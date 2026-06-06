const { MongoClient } = require('mongodb');
require('dotenv').config();

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db('veefore');
  const account = await db.collection('socialaccounts').findOne({ platform: 'instagram' });
  console.log("Token:", account.accessToken);
  console.log("EncryptedToken:", account.encryptedAccessToken);
  await client.close();
}
run();
