import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI as string);
  try {
    await client.connect();
    const db = client.db('veeforedb');
    
    const account = await db.collection('socialaccounts').findOne({ workspaceId: '684402c2fd2cd4eb6521b386' });
    if (account) {
      console.log(`Posts: ${account.totalPosts}`);
      console.log(`Likes: ${account.totalLikes}`);
    } else {
      console.log("No account found");
    }
  } finally {
    await client.close();
  }
}
run().catch(console.error);
