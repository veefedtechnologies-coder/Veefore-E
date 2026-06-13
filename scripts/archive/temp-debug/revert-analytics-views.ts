import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI as string);
  try {
    await client.connect();
    const db = client.db('veeforedb');
    
    const workspaceId = '684402c2fd2cd4eb6521b386';
    
    const res = await db.collection('analytics').updateMany(
      { workspaceId },
      { $set: { viewsWeek: 0, viewsDays28: 0 } }
    );
    console.log(`Reverted ${res.modifiedCount} analytics docs to viewsWeek = 0, viewsDays28 = 0`);
  } finally {
    await client.close();
  }
}
run().catch(console.error);
