import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db('veeforedb');
  const content = await db.collection('contents').findOne({ _id: new ObjectId('6a1478353a3a9117c14799bf') });
  console.log(content ? content.contentData : "Not found");
  await client.close();
}
run();
