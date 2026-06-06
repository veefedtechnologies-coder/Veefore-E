const mongoose = require('mongoose');
const { ContentModel } = require('./server/models/Content/Content');
const { SocialAccount } = require('./server/models/SocialAccount');
require('dotenv').config();

async function fix() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to DB');

  const accounts = await SocialAccount.find({ platform: 'instagram' });
  let fixedCount = 0;

  for (const acc of accounts) {
    if (!acc.accountId && !acc._id) continue;
    const targetAccountId = acc.accountId || acc._id.toString();
    
    // We can assume all instagram posts in this workspace belong to this account
    // (If they have multiple IG accounts, it might mix, but Veefore typically links 1 IG per workspace)
    const result = await ContentModel.updateMany(
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
