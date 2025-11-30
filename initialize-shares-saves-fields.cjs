// Initialize totalShares and totalSaves fields for existing accounts
const mongoose = require('mongoose');

const DATABASE_URL = process.env.DATABASE_URL || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function initializeFields() {
  try {
    console.log('🔍 Connecting to database...');
    await mongoose.connect(DATABASE_URL.replace('/?', '/veeforedb?'));
    
    const SocialAccount = mongoose.model('SocialAccount', new mongoose.Schema({}, { strict: false }));
    
    console.log('\n🔧 Initializing totalShares and totalSaves fields...');
    
    // Update ALL social accounts that don't have these fields
    const result = await SocialAccount.updateMany(
      {
        $or: [
          { totalShares: { $exists: false } },
          { totalSaves: { $exists: false } }
        ]
      },
      {
        $set: {
          totalShares: 0,
          totalSaves: 0
        }
      }
    );
    
    console.log(`\n✅ Updated ${result.modifiedCount} accounts`);
    
    // Verify for arpit.10
    const arpit = await SocialAccount.findOne({ username: 'arpit.10' }).lean();
    console.log('\n📊 Verification for @arpit.10:');
    console.log({
      totalShares: arpit.totalShares,
      totalSaves: arpit.totalSaves,
      totalLikes: arpit.totalLikes,
      totalComments: arpit.totalComments
    });
    
    if (arpit.totalShares !== undefined && arpit.totalSaves !== undefined) {
      console.log('\n🎉 SUCCESS! Fields are now initialized!');
      console.log('📝 Smart Polling will now be able to update these fields.');
    }
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

initializeFields();

