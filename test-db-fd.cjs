const { MongoClient } = require('mongodb');
require('dotenv').config();

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("No MONGODB_URI found in .env");
    process.exit(1);
  }
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('veefore');
    
    // Find "fd"
    const content = await db.collection('contents').find({ 
      $or: [
        { title: 'fd' },
        { "contentData.text": 'fd' },
        { "contentData.caption": 'fd' }
      ]
    }).toArray();
    
    console.log(`Found ${content.length} matching posts.`);
    for (const c of content) {
      console.log("Post ID:", c._id);
      console.log("Title:", c.title);
      console.log("Platform:", c.platform);
      console.log("Status:", c.status);
      console.log("ContentData:", JSON.stringify(c.contentData, null, 2));
      console.log("---------------");
    }
  } catch(e) {
    console.error(e);
  } finally {
    await client.close();
  }
}
run();
