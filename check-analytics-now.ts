import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI as string);
  try {
    await client.connect();
    const db = client.db('veeforedb');
    
    const workspaceId = '684402c2fd2cd4eb6521b386';
    
    const docs = await db.collection('analytics').find({ workspaceId }).toArray();
    console.log(`Found ${docs.length} analytics records.`);
    
    for (const d of docs) {
      console.log(`Date: ${d.date}, platform: ${d.platform}, views: ${d.views}, likes: ${d.likes}, comments: ${d.comments}, accountId: ${d.accountId}`);
    }
    
  } finally {
    await client.close();
  }
}
run().catch(console.error);
