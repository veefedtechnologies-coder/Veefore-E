const { MongoClient } = require('mongodb');

async function run() {
  try {
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db('veefore');

    const username = process.env.TEST_IG_USERNAME || 'arpit.10';
    const shares = parseInt(process.env.TEST_TOTAL_SHARES || '5', 10);
    const saves = parseInt(process.env.TEST_TOTAL_SAVES || '7', 10);

    const result = await db.collection('socialaccounts').findOneAndUpdate(
      { username },
      { $set: { totalShares: shares, totalSaves: saves, updatedAt: new Date() } },
      { returnDocument: 'after' }
    );

    if (!result.value) {
      console.log('No account found for username:', username);
    } else {
      console.log('Updated document:', {
        username: result.value.username,
        totalShares: result.value.totalShares,
        totalSaves: result.value.totalSaves,
      });
    }

    await client.close();
  } catch (e) {
    console.error('Test update failed:', e.message);
    process.exit(1);
  }
}

run();

