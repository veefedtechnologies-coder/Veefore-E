const mongoose = require('mongoose');

const uri = 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/veeforedb';

async function backfillContentAccountIds() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  console.log('Fetching social accounts...');
  const socialAccounts = await db.collection('socialaccounts').find({ platform: 'instagram' }).toArray();
  console.log(`Found ${socialAccounts.length} Instagram accounts`);

  // Create a map of workspaceId -> accountId (assuming 1 account per workspace for now)
  const workspaceAccountMap = {};
  for (const account of socialAccounts) {
    if (account.workspaceId) {
      if (!workspaceAccountMap[account.workspaceId.toString()]) {
        workspaceAccountMap[account.workspaceId.toString()] = account.accountId || account.id;
      }
    }
  }

  console.log('Finding Content documents without accountId...');
  const contentsToUpdate = await db.collection('contents').find({
    accountId: { $exists: false },
    platform: 'instagram'
  }).toArray();
  console.log(`Found ${contentsToUpdate.length} Content documents to update`);

  let updatedCount = 0;
  let skippedCount = 0;

  for (const content of contentsToUpdate) {
    const workspaceId = content.workspaceId?.toString();
    if (workspaceId && workspaceAccountMap[workspaceId]) {
      const accountId = workspaceAccountMap[workspaceId];
      await db.collection('contents').updateOne(
        { _id: content._id },
        { $set: { accountId: accountId } }
      );
      updatedCount++;
    } else {
      skippedCount++;
    }
  }

  console.log(`Update complete. Updated: ${updatedCount}, Skipped: ${skippedCount}`);
  process.exit(0);
}

backfillContentAccountIds().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
