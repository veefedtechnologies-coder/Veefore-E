const { MongoClient } = require('mongodb');

async function run() {
  try {
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db('veefore');

    const accounts = await db.collection('socialaccounts').find({ platform: 'instagram' }).project({ username: 1, workspaceId: 1, totalShares: 1, totalSaves: 1 }).toArray();
    const fs = require('fs');
    fs.writeFileSync(require('path').join(__dirname, 'out-socialaccounts.json'), JSON.stringify(accounts, null, 2));
    console.log('Wrote scripts/out-socialaccounts.json with', accounts.length, 'accounts');

    await client.close();
  } catch (e) {
    console.error('List failed:', e.message);
    process.exit(1);
  }
}

run();
