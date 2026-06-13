import { MongoClient } from 'mongodb';

async function run() {
  const uri = "mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('veeforedb');
  
  const acc = await db.collection('socialaccounts').findOne({ username: 'rahulc1020' });
  
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const lastWeek = new Date(today);
  lastWeek.setDate(lastWeek.getDate() - 7);

  const lastMonth = new Date(today);
  lastMonth.setDate(lastMonth.getDate() - 30);
  
  const snapshotYesterday = await db.collection('instagramfollowersnapshots').findOne({ 
      accountId: acc._id, 
      snapshotDate: { $gte: new Date(today.getTime() - 1.5 * 24 * 60 * 60 * 1000) }
  });
  
  const snapshotLastWeek = await db.collection('instagramfollowersnapshots').findOne({ 
      accountId: acc._id, 
      snapshotDate: { $gte: lastWeek }
  });

  const snapshotLastMonth = await db.collection('instagramfollowersnapshots').findOne({ 
      accountId: acc._id, 
      snapshotDate: { $gte: lastMonth }
  });
  
  console.log("Snapshots:", {
    yesterday: snapshotYesterday?.followerCount,
    lastWeek: snapshotLastWeek?.followerCount,
    lastMonth: snapshotLastMonth?.followerCount
  });

  await client.close();
}
run().catch(console.error);
