const { MongoClient } = require('mongodb');

async function run() {
  try {
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db('veefore');

    const doc = {
      workspaceId: 'testworkspace',
      platform: 'instagram',
      username: 'testuser',
      accountId: 'testaccountid',
      isActive: true,
      totalShares: 11,
      totalSaves: 13,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const res = await db.collection('socialaccounts').insertOne(doc);
    const back = await db.collection('socialaccounts').findOne({ _id: res.insertedId });
    console.log('Inserted and read back:', {
      _id: res.insertedId.toString(),
      username: back.username,
      totalShares: back.totalShares,
      totalSaves: back.totalSaves
    });

    await client.close();
  } catch (e) {
    console.error('Create failed:', e.message);
    process.exit(1);
  }
}

run();

