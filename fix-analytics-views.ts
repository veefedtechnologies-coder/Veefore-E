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
    if (doc) {
      const viewsDay = doc.viewsDay || doc.views || 0;
      const viewsWeek = Math.max(doc.viewsWeek || 0, viewsDay);
      const viewsDays28 = Math.max(doc.viewsDays28 || 0, viewsWeek);
      
      const res = await db.collection('analytics').updateOne(
        { _id: doc._id },
        { $set: { viewsWeek, viewsDays28 } }
      );
      console.log(`Updated analytics doc: viewsWeek = ${viewsWeek}, viewsDays28 = ${viewsDays28}`);
    } else {
      console.log("No analytics doc found");
    }
  } finally {
    await client.close();
  }
}
run().catch(console.error);
