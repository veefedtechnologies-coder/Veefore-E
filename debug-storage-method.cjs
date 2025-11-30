const { MongoClient } = require('mongodb');
const mongoose = require('mongoose');

// Load environment variables
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;

// Import the storage class - use MongoStorage instead of MongoDBStorage
const { storage } = require('./server/mongodb-storage.js');

async function debugStorageMethod() {
  console.log('🔍 [DEBUG] Testing getSocialAccountsByWorkspace method directly...\n');
  
  const workspaceId = '686d91be22c4290df81af016';
  
  try {
    // Use the imported storage instance directly
    console.log(`📊 Testing getSocialAccountsByWorkspace for workspace: ${workspaceId}`);
    
    const accounts = await storage.getSocialAccountsByWorkspace(workspaceId);
    
    console.log(`\n📋 Results from getSocialAccountsByWorkspace:`);
    console.log(`   - Found ${accounts.length} accounts`);
    
    for (const account of accounts) {
      console.log(`\n📱 Account: @${account.username}`);
      console.log(`   - Platform: ${account.platform}`);
      console.log(`   - Account ID: ${account.accountId}`);
      console.log(`   - Workspace ID: ${account.workspaceId}`);
      console.log(`   - Is Active: ${account.isActive}`);
      console.log(`   - Has accessToken: ${!!account.accessToken}`);
      console.log(`   - Has encryptedAccessToken: ${!!account.encryptedAccessToken}`);
      
      if (account.accessToken) {
        console.log(`   - AccessToken length: ${account.accessToken.length}`);
        console.log(`   - AccessToken preview: ${account.accessToken.substring(0, 20)}...`);
      }
      
      if (account.encryptedAccessToken) {
        console.log(`   - EncryptedAccessToken type: ${typeof account.encryptedAccessToken}`);
        if (typeof account.encryptedAccessToken === 'string') {
          console.log(`   - EncryptedAccessToken preview: ${account.encryptedAccessToken.substring(0, 50)}...`);
        } else {
          console.log(`   - EncryptedAccessToken object keys: ${Object.keys(account.encryptedAccessToken)}`);
        }
      }
    }
    
    // Now test the specific Instagram account filtering
    const instagramAccount = accounts.find(acc => 
      acc.platform === 'instagram' && 
      acc.isActive
    );
    
    console.log(`\n🎯 Instagram Account Filter Result:`);
    if (instagramAccount) {
      console.log(`   - Found Instagram account: @${instagramAccount.username}`);
      console.log(`   - Has accessToken: ${!!instagramAccount.accessToken}`);
      console.log(`   - AccessToken value: ${instagramAccount.accessToken ? 'EXISTS' : 'NULL/UNDEFINED'}`);
      
      if (instagramAccount.accessToken) {
        console.log(`   - ✅ This account SHOULD work with immediate sync`);
      } else {
        console.log(`   - ❌ This account will FAIL with "No access token available"`);
      }
    } else {
      console.log(`   - ❌ No active Instagram account found`);
    }
    
  } catch (error) {
    console.error('❌ Debug error:', error);
  } finally {
    // Close connections
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

debugStorageMethod().catch(console.error);