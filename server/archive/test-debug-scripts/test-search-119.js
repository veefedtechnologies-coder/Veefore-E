import { MongoClient } from 'mongodb';

async function run() {
  const uri = "mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('veeforedb');
  
  console.log("Searching for 119...");
  
  const accs = await db.collection('socialaccounts').find({ followersCount: 119 }).toArray();
  console.log("Accounts with 119 followers:", accs.length);
  
  const accs2 = await db.collection('socialaccounts').find({ totalFollowers: 119 }).toArray();
  console.log("Accounts with 119 totalFollowers:", accs2.length);

  const analytics = await db.collection('analytics').find({ followers: 119 }).toArray();
  console.log("Analytics with 119 followers:", analytics.length);
  
  const metrics = await db.collection('metrics').find({ followers: 119 }).toArray();
  console.log("Metrics with 119 followers:", metrics.length);
  
  await client.close();
}
run().catch(console.error);
