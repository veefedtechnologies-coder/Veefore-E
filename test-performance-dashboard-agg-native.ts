import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();
async function run() {
  const client = new MongoClient(process.env.MONGODB_URI as string);
  try {
    await client.connect();
    const db = client.db('veeforedb');
    
    // Use string "1" instead of ObjectId string for testing
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 90);
    
    // First, let's see what workspaceId format is in the DB
    const sample = await db.collection('analytics').findOne({});
    console.log("Sample analytics workspaceId type:", typeof sample?.workspaceId, sample?.workspaceId);
    
    // Try both formats
    console.log("\nTesting with exact string '684402c2fd2cd4eb6521b386'");
    const res1 = await db.collection('analytics').aggregate([
      { $match: { workspaceId: '684402c2fd2cd4eb6521b386' } },
      {
        $group: {
          _id: null,
          totalViews: { $sum: '$views' },
        }
      }
    ]).toArray();
    console.log(res1);
    
    console.log("\nTesting with exact string '1'");
    const res2 = await db.collection('analytics').aggregate([
      { $match: { workspaceId: '1' } },
      {
        $group: {
          _id: null,
          totalViews: { $sum: '$views' },
        }
      }
    ]).toArray();
    console.log(res2);
    
  } finally {
    await client.close();
  }
}
run().catch(console.error);
