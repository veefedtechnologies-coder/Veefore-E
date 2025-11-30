// Reset shares/saves to 0 so Smart Polling can update them
const mongoose = require('mongoose');

const DATABASE_URL = process.env.DATABASE_URL || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function resetFields() {
  try {
    console.log('🔍 Connecting to database...');
    await mongoose.connect(DATABASE_URL.replace('/?', '/veeforedb?'));
    
    const SocialAccount = mongoose.model('SocialAccount', new mongoose.Schema({}, { strict: false }));
    
    console.log('\n🔧 Resetting totalShares and totalSaves to 0 for @arpit.10...');
    
    const result = await SocialAccount.findOneAndUpdate(
      { username: 'arpit.10' },
      {
        $set: {
          totalShares: 0,
          totalSaves: 0
        }
      },
      { new: true }
    );
    
    console.log('\n✅ Reset complete!');
    console.log({
      totalShares: result.totalShares,
      totalSaves: result.totalSaves,
      totalLikes: result.totalLikes,
      totalComments: result.totalComments
    });
    
    console.log('\n📝 Smart Polling will update these values on the next cycle (every 3 minutes)');
    console.log('⏰ Wait 3 minutes, then refresh your dashboard to see 16 shares and 9 saves!');
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

resetFields();

