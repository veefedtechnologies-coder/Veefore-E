import mongoose from 'mongoose';
import { ObjectId } from 'mongodb';

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
  await mongoose.connect(uri);
  const db = mongoose.connection;
  const socialAccounts = db.collection('socialaccounts');

  const targetId = new ObjectId('6872e064de14dd309d8b1961');

  const update = {
    $set: {
      totalShares: 14,
      totalSaves: 2,
      postsAnalyzed: 6,
      updatedAt: new Date(),
      lastSyncAt: new Date(),
    },
  };

  const result = await socialAccounts.updateOne({ _id: targetId }, update);
  const doc = await socialAccounts.findOne({ _id: targetId });

  console.log(
    JSON.stringify(
      {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
        account: {
          _id: String(doc?._id),
          workspaceId: String(doc?.workspaceId || ''),
          username: doc?.username,
          totalShares: doc?.totalShares,
          totalSaves: doc?.totalSaves,
          postsAnalyzed: doc?.postsAnalyzed,
          updatedAt: doc?.updatedAt,
          lastSyncAt: doc?.lastSyncAt,
        },
      },
      null,
      2,
    ),
  );

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


