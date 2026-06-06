import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI as string);
  try {
    await client.connect();
    const db = client.db('veeforedb');
    
    const workspaceId = '684402c2fd2cd4eb6521b386';
    
    const docs = await db.collection('content').find({ workspaceId }).toArray();
    console.log(`Found ${docs.length} content records.`);
    
    let totalLikes = 0;
    for (const d of docs) {
      if (d.metrics?.likes) totalLikes += d.metrics.likes;
    }
    console.log("Total Likes in content:", totalLikes);
    
  } finally {
    await client.close();
  }
}
run().catch(console.error);
