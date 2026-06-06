import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI as string);
  try {
    await client.connect();
    const db = client.db('veeforedb');
    
    const workspaceId = '684402c2fd2cd4eb6521b386';
    
    const doc = await db.collection('analytics').findOne({ workspaceId });
    console.log(`views: ${doc?.views}, viewsDay: ${doc?.viewsDay}, viewsWeek: ${doc?.viewsWeek}, viewsDays28: ${doc?.viewsDays28}`);
    
  } finally {
    await client.close();
  }
}
run().catch(console.error);
