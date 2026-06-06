const { MongoClient } = require('mongodb');
require('dotenv').config();

async function run() {
  const uri = process.env.MONGODB_URI;
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('veeforedb');
    const content = await db.collection('contents').find({ 
      $or: [
        { title: 'fd' },
        { "contentData.text": 'fd' }
      ]
    }).toArray();
    
    for (const c of content) {
      console.log(`Title: ${c.title}, Text: ${c.contentData?.text}`);
      console.log(`MediaUrls:`, JSON.stringify(c.contentData?.mediaUrls));
      console.log(`MediaUrl:`, c.contentData?.mediaUrl);
      console.log(`ThumbnailUrl:`, c.contentData?.thumbnailUrl);
      console.log('---');
    }

  } catch(e) {
    console.error(e);
  } finally {
    await client.close();
  }
}
run();
