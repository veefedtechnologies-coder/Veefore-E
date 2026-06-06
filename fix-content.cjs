const mongoose = require('mongoose');
require('dotenv').config();

async function fix() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to DB');

  // Need to use the raw models because they might be ES modules
  const db = mongoose.connection.db;
  
  const accounts = await db.collection('socialaccounts').find({ platform: 'instagram' }).toArray();
  let fixedCount = 0;

  for (const acc of accounts) {
    if (!acc.accountId && !acc._id) continue;
    const targetAccountId = acc.accountId || acc._id.toString();
    
    const result = await db.collection('contents').updateMany(
      { 
        workspaceId: acc.workspaceId, 
        platform: 'instagram',
        accountId: { $exists: false } 
      },
      { 
        $set: { accountId: targetAccountId } 
      }
    );
    
    fixedCount += result.modifiedCount;
    if (result.modifiedCount > 0) {
      console.log(`Updated ${result.modifiedCount} posts for account ${targetAccountId}`);
    }
  }

  console.log(`Fixed ${fixedCount} total posts.`);
  process.exit(0);
}

fix().catch(console.error);
