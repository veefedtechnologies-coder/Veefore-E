import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI as string);
  try {
    await client.connect();
    const db = client.db('veeforedb');
    const acc = await db.collection('socialaccounts').findOne({ username: 'rahulc1020' });
    console.log("Dashboard analytics uses socialaccounts fields:");
    console.log(`followersCount: ${acc?.followersCount}`);
    console.log(`totalLikes: ${acc?.totalLikes}`);
    console.log(`totalComments: ${acc?.totalComments}`);
    console.log(`totalViews (our view var): ${acc?.totalViews}`);
    console.log(`totalReach: ${acc?.totalReach}`);
    console.log(`mediaCount: ${acc?.mediaCount}`);
    console.log(`engagementRate: ${acc?.engagementRate}`);
  } finally {
    await client.close();
  }
}
run().catch(console.error);
