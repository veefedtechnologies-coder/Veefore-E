// Final verification: Test that the API now returns totalShares and totalSaves
const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/veeforedb';

async function verifyFix() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const { MongoStorage } = require('./server/mongodb-storage.js');
    const storage = new MongoStorage();
    await storage.connect();

    // Test with the user's workspace
    const workspaceId = '684402c2fd2cd4eb6521b386';
    console.log(`📊 Testing fix for workspace: ${workspaceId}\n`);

    const accounts = await storage.getSocialAccountsByWorkspace(workspaceId);
    
    if (accounts.length === 0) {
      console.log('❌ No accounts found in workspace');
      process.exit(1);
    }

    const instagramAccount = accounts.find(a => a.platform === 'instagram');
    
    if (!instagramAccount) {
      console.log('❌ No Instagram account found');
      process.exit(1);
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ FIX VERIFICATION');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Account:', instagramAccount.username);
    console.log('Workspace:', instagramAccount.workspaceId);
    console.log('\n📊 CONVERTED ACCOUNT DATA (what API returns):');
    console.log({
      totalShares: instagramAccount.totalShares ?? 'MISSING ❌',
      totalSaves: instagramAccount.totalSaves ?? 'MISSING ❌',
      totalLikes: instagramAccount.totalLikes ?? 'MISSING ❌',
      totalComments: instagramAccount.totalComments ?? 'MISSING ❌',
    });

    if (instagramAccount.totalShares !== undefined && instagramAccount.totalShares !== null) {
      console.log('\n✅ SUCCESS: totalShares field is present!');
    } else {
      console.log('\n❌ ERROR: totalShares field is MISSING!');
    }

    if (instagramAccount.totalSaves !== undefined && instagramAccount.totalSaves !== null) {
      console.log('✅ SUCCESS: totalSaves field is present!');
    } else {
      console.log('❌ ERROR: totalSaves field is MISSING!');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

verifyFix();

