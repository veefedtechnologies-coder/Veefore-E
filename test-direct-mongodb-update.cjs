// Direct MongoDB test to update shares/saves
const mongoose = require('mongoose');

const DATABASE_URL = process.env.DATABASE_URL || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function testDirectUpdate() {
  try {
    console.log('🔍 Connecting to database...');
    await mongoose.connect(DATABASE_URL.replace('/?', '/veeforedb?'));
    
    const SocialAccount = mongoose.model('SocialAccount', new mongoose.Schema({
      totalShares: Number,
      totalSaves: Number,
      totalLikes: Number,
      totalComments: Number
    }, { strict: false }));
    
    const accountId = '68ea9e947da51fa1ff125268';
    
    console.log('\n📊 BEFORE UPDATE:');
    const before = await SocialAccount.findById(accountId).lean();
    console.log({
      totalShares: before.totalShares,
      totalSaves: before.totalSaves,
      totalLikes: before.totalLikes,
      totalComments: before.totalComments
    });
    
    console.log('\n🔧 Performing direct update with findByIdAndUpdate...');
    const updated = await SocialAccount.findByIdAndUpdate(
      accountId,
      {
        totalShares: 999,
        totalSaves: 888,
        totalLikes: 777,
        totalComments: 666,
        updatedAt: new Date()
      },
      { new: true }
    );
    
    console.log('\n📊 AFTER UPDATE (from findByIdAndUpdate response):');
    console.log({
      totalShares: updated.totalShares,
      totalSaves: updated.totalSaves,
      totalLikes: updated.totalLikes,
      totalComments: updated.totalComments
    });
    
    console.log('\n📊 VERIFY BY RE-QUERYING:');
    const verify = await SocialAccount.findById(accountId).lean();
    console.log({
      totalShares: verify.totalShares,
      totalSaves: verify.totalSaves,
      totalLikes: verify.totalLikes,
      totalComments: verify.totalComments
    });
    
    if (verify.totalShares === 999 && verify.totalSaves === 888) {
      console.log('\n✅ SUCCESS! Direct update worked!');
      console.log('📝 This means the schema and database connection are fine.');
      console.log('🐛 The bug must be in how Smart Polling is calling the update.');
    } else {
      console.log('\n❌ FAILED! Direct update did not work!');
      console.log('🐛 There might be a Mongoose middleware or schema issue.');
    }
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testDirectUpdate();

