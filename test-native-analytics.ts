import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();
async function run() {
  const client = new MongoClient(process.env.MONGODB_URI as string);
  try {
    await client.connect();
    const db = client.db('veeforedb');
    const all = await db.collection('analytics').find({}).toArray();
    console.log(`Found ${all.length} analytics records`);
    for (const a of all) {
      console.log(`workspaceId: ${a.workspaceId}, views: ${a.views}, likes: ${a.likes}, comments: ${a.comments}, viewsDay: ${a.viewsDay}`);
    }
  } finally {
    await client.close();
  }
}
run().catch(console.error);
