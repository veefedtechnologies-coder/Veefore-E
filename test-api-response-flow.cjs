// Test script to verify API response includes totalShares and totalSaves
const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/veeforedb';

async function testApiResponse() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const SocialAccountSchema = new mongoose.Schema({}, { strict: false });
    const SocialAccountModel = mongoose.model('SocialAccount', SocialAccountSchema);

    // Find Instagram account in the correct workspace
    const workspaceId = '684402c2fd2cd4eb6521b386';
    const account = await SocialAccountModel.findOne({
      platform: 'instagram',
      workspaceId: workspaceId
    });

    if (!account) {
      console.log('❌ No Instagram account found in workspace:', workspaceId);
      process.exit(1);
    }

    console.log('\n📊 RAW DATABASE DATA:');
    console.log({
      username: account.username,
      totalShares: account.totalShares,
      totalSaves: account.totalSaves,
      totalLikes: account.totalLikes,
      totalComments: account.totalComments,
      workspaceId: account.workspaceId
    });

    // Simulate what convertSocialAccount does
    const converted = {
      id: account._id.toString(),
      username: account.username,
      totalShares: account.totalShares ?? null,
      totalSaves: account.totalSaves ?? null,
      totalLikes: account.totalLikes ?? null,
      totalComments: account.totalComments ?? null,
    };

    console.log('\n🔄 CONVERTED ACCOUNT DATA:');
    console.log(converted);

    // Simulate what the API route does
    const apiResponse = {
      totalShares: converted.totalShares || 0,
      totalSaves: converted.totalSaves || 0,
      totalLikes: converted.totalLikes || 0,
      totalComments: converted.totalComments || 0,
    };

    console.log('\n🌐 API RESPONSE (what frontend receives):');
    console.log(apiResponse);

    if (apiResponse.totalShares === 0 && account.totalShares > 0) {
      console.log('\n❌ PROBLEM: Database has shares but API returns 0!');
      console.log('   This means the conversion is losing the data.');
    } else if (account.totalShares === 0) {
      console.log('\n⚠️  Database has 0 shares - need to sync data!');
    } else {
      console.log('\n✅ Data flow looks correct!');
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testApiResponse();

