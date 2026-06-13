import { MongoClient } from 'mongodb';

async function run() {
  const uri = "mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('veeforedb');
  
  const accounts = await db.collection('socialaccounts').find({ workspaceId: "684402c2fd2cd4eb6521b386" }).toArray();
  console.log("Accounts in DB:", accounts.length);
  accounts.forEach(a => console.log(a.username, a.platform, "followers:", a.followersCount));
  
  await client.close();
}
run().catch(console.error);
