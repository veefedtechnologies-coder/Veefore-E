// Restore real likes/comments values
const mongoose = require('mongoose');

const DATABASE_URL = process.env.DATABASE_URL || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function restoreValues() {
  try {
    console.log('🔍 Connecting to database...');
    await mongoose.connect(DATABASE_URL.replace('/?', '/veeforedb?'));
    
    const SocialAccount = mongoose.model('SocialAccount', new mongoose.Schema({}, { strict: false }));
    
    console.log('\n🔧 Restoring real totalLikes and totalComments for @arpit.10...');
    
    const result = await SocialAccount.findOneAndUpdate(
      { username: 'arpit.10' },
      {
        $set: {
          totalLikes: 508,
          totalComments: 71,
          totalShares: 0,
          totalSaves: 0
        }
      },
      { new: true }
    );
    
    console.log('\n✅ Restored!');
    console.log({
      totalLikes: result.totalLikes,
      totalComments: result.totalComments,
      totalShares: result.totalShares,
      totalSaves: result.totalSaves
    });
    
    console.log('\n⏰ Smart Polling will update shares/saves on next cycle!');
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

restoreValues();

