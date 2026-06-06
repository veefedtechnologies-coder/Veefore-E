import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const uri = process.env.MONGODB_URI as string;
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('veeforedb');
  
  const workspaceId = '684402c2fd2cd4eb6521b386';
  
  const resultStr = await db.collection('analytics').updateMany(
    { workspaceId },
    { $set: { likes: 0, comments: 0, shares: 0, views: 0, reach: 0, reachDay: 0, reachWeek: 0, reachDays28: 0, viewsDay: 0, viewsWeek: 0, viewsDays28: 0 } }
  );
  
  console.log(`Native Reset metrics for ${resultStr.modifiedCount} records.`);
  
  await client.close();
  process.exit(0);
}
run();
