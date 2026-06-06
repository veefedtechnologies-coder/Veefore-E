const { MongoClient } = require('mongodb');

async function run() {
  const client = await MongoClient.connect('mongodb://localhost:27017/veefore-e');
  const db = client.db('veefore-e');

  const socialAccounts = await db.collection('socialaccounts').find({}).toArray();
  console.log('Social Accounts:', socialAccounts.map(a => ({ id: a._id, platform: a.platform, followers: a.followersCount, reach: a.totalReach, username: a.username })));

  const analytics = await db.collection('analytics').find({}).sort({ date: -1 }).limit(5).toArray();
  console.log('Analytics records:', analytics.map(a => ({ date: a.date, platform: a.platform, followers: a.followers, reach: a.reach, reachDay: a.reachDay, reachWeek: a.reachWeek, viewsDay: a.viewsDay })));

  await client.close();
}

run().catch(console.error);
