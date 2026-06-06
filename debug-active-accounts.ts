import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });
const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME || 'veeforedb';

async function run() {
  const client = new MongoClient(uri);
  await client.connect();
  console.log('Connected to DB:', dbName);
  const db = client.db(dbName);
  const accounts = await db.collection('socialaccounts').find({ workspaceId: '684402c2fd2cd4eb6521b386' }).toArray();
  console.log(`Found ${accounts.length} accounts in raw DB.`);
  for (const acc of accounts) {
    console.log(`@${acc.username}: tokenStatus='${acc.tokenStatus}', isConnected=${acc.isConnected}, hasAccessToken=${acc.hasAccessToken}, hasAccessTokenField=${!!acc.accessToken}, isActive=${acc.isActive}`);
  }
  await client.close();
}
run().catch(console.error);
