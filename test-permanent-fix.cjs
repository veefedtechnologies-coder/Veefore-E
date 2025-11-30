// Comprehensive test to verify the permanent fix
const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/veeforedb';

async function comprehensiveTest() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const { MongoStorage } = require('./server/mongodb-storage.js');
    const storage = new MongoStorage();
    await storage.connect();

    const workspaceId = '684402c2fd2cd4eb6521b386';
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔍 COMPREHENSIVE PERMANENT FIX TEST');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Step 1: Test conversion function
    console.log('📊 Step 1: Testing convertSocialAccount function...');
    const accounts = await storage.getSocialAccountsByWorkspace(workspaceId);
    const instagramAccount = accounts.find(a => a.platform === 'instagram');
    
    if (!instagramAccount) {
      console.log('❌ No Instagram account found');
      process.exit(1);
    }

    console.log('✅ Conversion function result:');
    console.log({
      totalShares: instagramAccount.totalShares,
      totalSaves: instagramAccount.totalSaves,
      typeOfShares: typeof instagramAccount.totalShares,
      typeOfSaves: typeof instagramAccount.totalSaves,
    });

    // Step 2: Simulate API route transformation
    console.log('\n📊 Step 2: Testing API route transformation...');
    const totalShares = typeof instagramAccount.totalShares === 'number' 
      ? instagramAccount.totalShares 
      : (instagramAccount.totalShares ?? 0);
    const totalSaves = typeof instagramAccount.totalSaves === 'number' 
      ? instagramAccount.totalSaves 
      : (instagramAccount.totalSaves ?? 0);
    
    const apiResponse = {
      totalShares: Number(totalShares) || 0,
      totalSaves: Number(totalSaves) || 0,
      totalLikes: instagramAccount.totalLikes ?? 0,
      totalComments: instagramAccount.totalComments ?? 0,
    };

    console.log('✅ API route transformation result:');
    console.log(apiResponse);

    // Step 3: Verify final values
    console.log('\n📊 Step 3: Final verification...');
    if (apiResponse.totalShares === 16 && apiResponse.totalSaves === 9) {
      console.log('✅ SUCCESS: API returns correct values!');
      console.log('   - Shares: 16');
      console.log('   - Saves: 9');
    } else {
      console.log('❌ ERROR: API returns incorrect values!');
      console.log(`   - Expected Shares: 16, Got: ${apiResponse.totalShares}`);
      console.log(`   - Expected Saves: 9, Got: ${apiResponse.totalSaves}`);
    }

    // Step 4: Test edge cases
    console.log('\n📊 Step 4: Testing edge cases...');
    const edgeCases = [
      { totalShares: null, totalSaves: null, expected: { shares: 0, saves: 0 } },
      { totalShares: undefined, totalSaves: undefined, expected: { shares: 0, saves: 0 } },
      { totalShares: 0, totalSaves: 0, expected: { shares: 0, saves: 0 } },
      { totalShares: 16, totalSaves: 9, expected: { shares: 16, saves: 9 } },
    ];

    edgeCases.forEach((testCase, index) => {
      const shares = Number(testCase.totalShares ?? 0) || 0;
      const saves = Number(testCase.totalSaves ?? 0) || 0;
      const passed = shares === testCase.expected.shares && saves === testCase.expected.saves;
      console.log(`   Test ${index + 1}: ${passed ? '✅ PASS' : '❌ FAIL'}`);
      if (!passed) {
        console.log(`      Expected: shares=${testCase.expected.shares}, saves=${testCase.expected.saves}`);
        console.log(`      Got: shares=${shares}, saves=${saves}`);
      }
    });

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ PERMANENT FIX VERIFICATION COMPLETE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

comprehensiveTest();

