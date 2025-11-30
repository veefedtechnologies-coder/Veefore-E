const mongoose = require('mongoose');

const DATABASE_URL = 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0'.replace('/?', '/veeforedb?');

async function run() {
  try {
    await mongoose.connect(DATABASE_URL);
    const SocialAccount = mongoose.model('SocialAccountDebug', new mongoose.Schema({}, { strict: false }), 'socialaccounts');
    
    const account = await SocialAccount.findOne({ username: 'arpit.10' }).lean();
    
    if (!account) {
      console.log('❌ No account found for arpit.10');
    } else {
      console.log('✅ Account found:', {
        workspaceId: account.workspaceId,
        totalShares: account.totalShares,
        totalSaves: account.totalSaves,
        totalLikes: account.totalLikes,
        totalComments: account.totalComments,
        followers: account.followersCount,
        updatedAt: account.updatedAt
      });
    }
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

run();

