import { MongoClient, ObjectId } from 'mongodb';

async function run() {
  const uri = 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

  // wait, the local codebase uses veeforedb, let me use the local mongodb or whatever is in .env
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('veeforedb');
    const content = await db.collection('contents').findOne({ _id: new ObjectId('6a1330fd9e597dcfa6172656') });
    console.log('Content:', content);
  } finally {
    await client.close();
  }
}

run().catch(console.error);
