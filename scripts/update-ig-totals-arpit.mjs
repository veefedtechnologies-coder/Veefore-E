import { MongoClient, ObjectId } from 'mongodb';

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('veeforedb');
    const socialAccounts = db.collection('socialaccounts');

    const accountId = new ObjectId('68e2b772fe6ea79545cb4250'); // arpit.10

    const update = {
      $set: {
        totalShares: 14,
        totalSaves: 2,
        postsAnalyzed: 6,
        updatedAt: new Date(),
        lastSyncAt: new Date(),
      },
    };

    const result = await socialAccounts.updateOne({ _id: accountId }, update);
    const after = await socialAccounts.findOne({ _id: accountId });

    console.log(
      JSON.stringify(
        {
          matchedCount: result.matchedCount,
          modifiedCount: result.modifiedCount,
          account: {
            _id: String(after?._id),
            workspaceId: String(after?.workspaceId || ''),
            username: after?.username,
            totalShares: after?.totalShares,
            totalSaves: after?.totalSaves,
            postsAnalyzed: after?.postsAnalyzed,
            updatedAt: after?.updatedAt,
            lastSyncAt: after?.lastSyncAt,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


