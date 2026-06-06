const { MongoClient } = require('mongodb');
require('dotenv').config();

async function run() {
  const uri = process.env.MONGODB_URI;
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('veefore');
    const content = await db.collection('contents').find({}).limit(20).toArray();
    
    for (const c of content) {
      console.log(`Title: ${c.title || c.contentData?.text}, mediaUrls:`, JSON.stringify(c.contentData?.mediaUrls));
    }
  } finally {
    await client.close();
  }
}
run().catch(console.error);
