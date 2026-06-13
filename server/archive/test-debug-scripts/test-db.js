import { MongoClient } from 'mongodb';

async function run() {
  const uri = "mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('veeforedb');
  
  const accounts = await db.collection('socialaccounts').find({}).toArray();
  accounts.forEach(a => { 
    if(a.followersCount === 116 || a.followersCount === 119 || a.followersCount === 118 || a.followersCount > 100 && a.followersCount < 130) {
      console.log(a.username, a.platform, "followers:", a.followersCount);
    }
  });
  
  await client.close();
}
run().catch(console.error);
