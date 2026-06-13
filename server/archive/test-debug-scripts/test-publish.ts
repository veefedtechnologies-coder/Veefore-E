import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
import { SimpleInstagramPublisher } from './simple-instagram-publisher.js';
dotenv.config({ path: '../.env' });

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db('veeforedb');
  
  const c = await db.collection('contents').findOne({ _id: new ObjectId('6a149936376cf002476ec825') }); // REEL
  const accounts = await db.collection('socialaccounts').find({ workspaceId: c.workspaceId, platform: 'instagram' }).toArray();
  const account = accounts[0];
  
  console.log('Attempting to publish REEL:', c.contentData?.mediaUrls[0]);
  
  try {
    const result = await SimpleInstagramPublisher.publishContent(
      account.accessToken,
      c.contentData?.mediaUrls[0],
      c.contentData?.postContent || '',
      'reel',
      account.accountId || account._id.toString()
    );
    console.log('Publish result:', result);
  } catch (err) {
    console.error('Publish threw error:', err);
  }
  
  await client.close();
}

run().catch(console.error);
