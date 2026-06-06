import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI as string);
  try {
    await client.connect();
    const db = client.db('veeforedb');
    
    const workspaceId = '684402c2fd2cd4eb6521b386';
    
    const res = await db.collection('socialaccounts').updateMany(
      { workspaceId },
      { $set: { totalViews: 24 } }
    );
    console.log(`Updated ${res.modifiedCount} social accounts to totalViews: 24`);
    
  } finally {
    await client.close();
  }
}
run().catch(console.error);
