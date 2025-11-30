// Quick script to verify shares/saves data is in database
const mongoose = require('mongoose');

const DATABASE_URL = process.env.DATABASE_URL || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function verifyData() {
  try {
    console.log('🔍 Connecting to database...');
    await mongoose.connect(DATABASE_URL.replace('/?', '/veeforedb?'));
    
    const SocialAccount = mongoose.model('SocialAccount', new mongoose.Schema({}, { strict: false }));
    
    const account = await SocialAccount.findOne({ username: 'arpit.10' }).lean();
    
    if (!account) {
      console.log('❌ Account not found');
      process.exit(1);
    }
    
    console.log('\n✅ DATABASE VERIFICATION:');
    console.log('========================');
    console.log(`Username: @${account.username}`);
    console.log(`Followers: ${account.followersCount || 0}`);
    console.log(`Total Likes: ${account.totalLikes || 0}`);
    console.log(`Total Comments: ${account.totalComments || 0}`);
    console.log(`Total Shares: ${account.totalShares || 0} ${account.totalShares > 0 ? '✅' : '❌'}`);
    console.log(`Total Saves: ${account.totalSaves || 0} ${account.totalSaves > 0 ? '✅' : '❌'}`);
    console.log(`Last Updated: ${account.lastSyncAt || 'Never'}`);
    console.log('========================\n');
    
    if (account.totalShares > 0 && account.totalSaves > 0) {
      console.log('🎉 SUCCESS! Shares/Saves data IS in the database!');
      console.log('📱 If your dashboard shows 0, do a HARD REFRESH: Ctrl+Shift+R');
    } else {
      console.log('⚠️  WARNING: Shares/Saves are still 0 in database');
    }
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

verifyData();

