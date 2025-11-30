/**
 * Check all Instagram accounts in the database
 * This will help us understand if the token issue is specific to arpit.10 or system-wide
 */

const { MongoClient } = require('mongodb');

const MONGODB_URI = 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function checkAllInstagramAccounts() {
  let client;
  
  try {
    console.log('🔍 Checking all Instagram accounts in the database...');
    
    // Connect to MongoDB
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db('veeforedb');
    const collection = db.collection('socialaccounts');
    
    // Find all Instagram accounts
    const accounts = await collection.find({ platform: 'instagram' }).toArray();
    
    console.log(`\n📊 Found ${accounts.length} Instagram account(s):`);
    console.log('='.repeat(50));
    
    for (const account of accounts) {
      console.log(`\n👤 Username: ${account.username}`);
      console.log(`   Account ID: ${account.accountId}`);
      console.log(`   Workspace ID: ${account.workspaceId}`);
      console.log(`   Is Active: ${account.isActive}`);
      console.log(`   Has accessToken: ${!!account.accessToken}`);
      console.log(`   Has encryptedAccessToken: ${!!account.encryptedAccessToken}`);
      console.log(`   Has refreshToken: ${!!account.refreshToken}`);
      console.log(`   Has encryptedRefreshToken: ${!!account.encryptedRefreshToken}`);
      
      if (account.accessToken) {
        console.log(`   AccessToken length: ${account.accessToken.length}`);
        console.log(`   AccessToken preview: ${account.accessToken.substring(0, 20)}...`);
        console.log(`   AccessToken contains 'aes-256-gcm': ${account.accessToken.includes('aes-256-gcm')}`);
      }
      
      if (account.encryptedAccessToken) {
        console.log(`   EncryptedAccessToken type: ${typeof account.encryptedAccessToken}`);
        if (typeof account.encryptedAccessToken === 'object') {
          console.log(`   EncryptedAccessToken keys: ${Object.keys(account.encryptedAccessToken)}`);
        }
      }
      
      if (account.expiresAt) {
        console.log(`   Token expires at: ${account.expiresAt}`);
        const isExpired = new Date(account.expiresAt) < new Date();
        console.log(`   Token is expired: ${isExpired}`);
      }
      
      if (account.lastTokenFix) {
        console.log(`   Last token fix: ${account.lastTokenFix}`);
      }
      
      // Check reach data
      if (account.reachData) {
        console.log(`   Has reach data: true`);
        if (account.reachData.reach !== undefined) {
          console.log(`   Current reach: ${account.reachData.reach}`);
        }
      } else {
        console.log(`   Has reach data: false`);
      }
    }
    
    // Summary
    console.log(`\n📈 SUMMARY:`);
    console.log('='.repeat(30));
    const withAccessToken = accounts.filter(acc => acc.accessToken).length;
    const withEncryptedToken = accounts.filter(acc => acc.encryptedAccessToken).length;
    const withReachData = accounts.filter(acc => acc.reachData && acc.reachData.reach > 0).length;
    
    console.log(`Total Instagram accounts: ${accounts.length}`);
    console.log(`Accounts with accessToken: ${withAccessToken}`);
    console.log(`Accounts with encryptedAccessToken: ${withEncryptedToken}`);
    console.log(`Accounts with reach data > 0: ${withReachData}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    if (client) {
      await client.close();
      console.log('\n🔌 Disconnected from MongoDB');
    }
  }
}

checkAllInstagramAccounts();