import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();
async function run() {
  const client = new MongoClient(process.env.MONGODB_URI as string);
  try {
    await client.connect();
    const db = client.db('veeforedb');
    const acc = await db.collection('socialaccounts').findOne({ username: 'rahulc1020' });
    console.log(`totalLikes: ${acc?.totalLikes}, totalViews: ${acc?.totalViews}`);
  } finally {
    await client.close();
  }
}
run().catch(console.error);
