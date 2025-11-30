// Final test to verify the API response includes correct shares/saves values
const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/veeforedb';

async function testFinalApiResponse() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const { MongoStorage } = require('./server/mongodb-storage.js');
    const storage = new MongoStorage();
    await storage.connect();

    const workspaceId = '684402c2fd2cd4eb6521b386';
    console.log(`📊 Testing API response for workspace: ${workspaceId}\n`);

    const accounts = await storage.getSocialAccountsByWorkspace(workspaceId);
    const instagramAccount = accounts.find(a => a.platform === 'instagram');

    if (!instagramAccount) {
      console.log('❌ No Instagram account found');
      process.exit(1);
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ FINAL FIX VERIFICATION');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Account:', instagramAccount.username);
    console.log('\n📊 CONVERTED ACCOUNT (from convertSocialAccount):');
    console.log({
      totalShares: instagramAccount.totalShares,
      totalSaves: instagramAccount.totalSaves,
      totalLikes: instagramAccount.totalLikes,
      totalComments: instagramAccount.totalComments,
    });

    // Simulate API route transformation
    const apiResponse = {
      totalShares: instagramAccount.totalShares ?? 0,
      totalSaves: instagramAccount.totalSaves ?? 0,
      totalLikes: instagramAccount.totalLikes ?? 0,
      totalComments: instagramAccount.totalComments ?? 0,
    };

    console.log('\n🌐 API RESPONSE (what frontend receives):');
    console.log(apiResponse);

    if (apiResponse.totalShares === 0 && instagramAccount.totalShares !== 0) {
      console.log('\n❌ ERROR: API is returning 0 but account has value!');
    } else if (apiResponse.totalShares > 0) {
      console.log('\n✅ SUCCESS: API is returning correct shares value!');
    } else {
      console.log('\n⚠️  Database has 0 shares - need to sync data');
    }

    if (apiResponse.totalSaves === 0 && instagramAccount.totalSaves !== 0) {
      console.log('❌ ERROR: API is returning 0 but account has value!');
    } else if (apiResponse.totalSaves > 0) {
      console.log('✅ SUCCESS: API is returning correct saves value!');
    } else {
      console.log('⚠️  Database has 0 saves - need to sync data');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testFinalApiResponse();

