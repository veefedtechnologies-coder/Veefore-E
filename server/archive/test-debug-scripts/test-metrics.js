import { MongoClient } from 'mongodb';

async function run() {
  const uri = "mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('veeforedb');
  
  const acc = await db.collection('socialaccounts').findOne({ username: 'rahulc1020' });
  console.log("Account:", acc.accountId);
  
  const metrics = await db.collection('metrics').find({ instagramAccountId: acc.accountId }).toArray();
  console.log("Metrics count:", metrics.length);
  metrics.forEach(m => console.log(m.followers, m.reach, m.period, m.startDate));
  
  const analytics = await db.collection('analytics').find({ accountId: acc.accountId }).toArray();
  console.log("Analytics count:", analytics.length);
  analytics.forEach(m => console.log(m.followers, m.reachDay, m.reachWeek, m.reachDays28, m.date));
  
  await client.close();
}
run().catch(console.error);
