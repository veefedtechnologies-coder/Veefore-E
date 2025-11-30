// Force update shares/saves using $set operator
const mongoose = require('mongoose');

const DATABASE_URL = process.env.DATABASE_URL || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function forceUpdate() {
  try {
    console.log('🔍 Connecting to database...');
    await mongoose.connect(DATABASE_URL.replace('/?', '/veeforedb?'));
    
    const SocialAccount = mongoose.model('SocialAccount', new mongoose.Schema({}, { strict: false }));
    
    const accountId = '68ea9e947da51fa1ff125268';
    
    console.log('\n🔧 Forcing update with $set operator...');
    const result = await SocialAccount.findByIdAndUpdate(
      accountId,
      {
        $set: {
          totalShares: 16,
          totalSaves: 9,
          totalLikes: 508,
          totalComments: 71,
          updatedAt: new Date()
        }
      },
      { new: true }
    );
    
    console.log('\n✅ Update complete!');
    console.log({
      totalShares: result.totalShares,
      totalSaves: result.totalSaves,
      totalLikes: result.totalLikes,
      totalComments: result.totalComments
    });
    
    if (result.totalShares === 16 && result.totalSaves === 9) {
      console.log('\n🎉 SUCCESS! Values are now in the database!');
      console.log('📱 Refresh your dashboard (Ctrl+Shift+R) to see Shares: 16 and Saves: 9!');
    }
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

forceUpdate();

