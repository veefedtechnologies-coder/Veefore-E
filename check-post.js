import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db('veeforedb');
  const content = await db.collection('contents').findOne({ _id: new ObjectId('6a147b6be53c5fbad6634dcf') });
  console.log("Status:", content?.status);
  console.log("Instagram Post ID:", content?.instagramPostId);
  await client.close();
}
run();
