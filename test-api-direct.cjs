// Test the actual API endpoint to see what it returns
const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/veeforedb';

async function testApiResponse() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Import the storage module
    const { MongoStorage } = require('./server/mongodb-storage.js');
    const storage = new MongoStorage();
    await storage.connect();

    // Test with the workspace that HAS the Instagram account
    const workspaceId = '6843035f111709a736159e39';
    console.log(`📊 Testing API response for workspace: ${workspaceId}\n`);

    const accounts = await storage.getSocialAccountsByWorkspace(workspaceId);
    console.log(`Found ${accounts.length} account(s)\n`);

    for (const account of accounts) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('RAW ACCOUNT (from getSocialAccountsByWorkspace):');
      console.log({
        id: account.id,
        username: account.username,
        platform: account.platform,
        workspaceId: account.workspaceId,
        totalShares: account.totalShares,
        totalSaves: account.totalSaves,
        totalLikes: account.totalLikes,
        totalComments: account.totalComments,
      });

      // Simulate what the API route does
      const transformed = {
        id: account.id,
        username: account.username,
        platform: account.platform,
        totalShares: account.totalShares || 0,
        totalSaves: account.totalSaves || 0,
        totalLikes: account.totalLikes || 0,
        totalComments: account.totalComments || 0,
      };

      console.log('\nTRANSFORMED (what API sends to frontend):');
      console.log(transformed);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    }

    // Also test with the workspace the user thinks they're viewing
    const userWorkspaceId = '684402c2fd2cd4eb6521b386';
    console.log(`\n📊 Testing API response for workspace: ${userWorkspaceId}\n`);
    
    try {
      const userAccounts = await storage.getSocialAccountsByWorkspace(userWorkspaceId);
      console.log(`Found ${userAccounts.length} account(s) in user's workspace\n`);
      
      if (userAccounts.length === 0) {
        console.log('❌ NO ACCOUNTS FOUND in user\'s workspace!');
        console.log('   This explains why shares/saves show 0.');
        console.log('   The Instagram account is in a different workspace.');
      }
    } catch (error) {
      console.log('❌ Error fetching accounts for user workspace:', error.message);
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testApiResponse();

