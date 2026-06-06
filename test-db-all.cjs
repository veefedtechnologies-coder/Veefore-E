const { MongoClient } = require('mongodb');
require('dotenv').config();

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI);
  try {
    await client.connect();
    const db = client.db('veefore');
    
    const content = await db.collection('contents').find().sort({ _id: -1 }).limit(10).toArray();
    
    console.log(`Found ${content.length} posts total.`);
    for (const c of content) {
      console.log(`Title: ${c.title}, Text: ${c.contentData?.text}`);
      console.log(`MediaUrls: ${JSON.stringify(c.contentData?.mediaUrls)}`);
      console.log(`MediaUrl: ${c.contentData?.mediaUrl}`);
      console.log("---------------");
    }
  } catch(e) {
    console.error(e);
  } finally {
    await client.close();
  }
}
run();
