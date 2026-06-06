const { MongoClient } = require('mongodb');
require('dotenv').config();

async function run() {
  const uri = process.env.MONGODB_URI;
  const client = new MongoClient(uri);
  try {
    await client.connect();
    
    // Check 'veeforedb' db
    const db = client.db('veeforedb');
    let count = await db.collection('contents').countDocuments();
    console.log(`veeforedb.contents has ${count} docs`);

    const posts = await db.collection('contents').find().sort({ _id: -1 }).limit(10).toArray();
    for(const p of posts) {
      console.log(`Title: ${p.title}, Text: ${p.contentData?.text}`);
      console.log(`MediaUrls:`, JSON.stringify(p.contentData?.mediaUrls));
      console.log(`MediaUrl:`, p.contentData?.mediaUrl);
      console.log('---');
    }

  } catch(e) {
    console.error(e);
  } finally {
    await client.close();
  }
}
run();
