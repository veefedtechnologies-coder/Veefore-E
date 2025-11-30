const { MongoClient } = require('mongodb');

async function debugDatabaseShares() {
  let client;
  
  try {
    console.log('🔍 Connecting to MongoDB to check shares data...');
    
    // Connect to MongoDB
    client = new MongoClient('mongodb://localhost:27017');
    await client.connect();
    
    const db = client.db('veefore');
    const collection = db.collection('socialaccounts');
    
    // Find all Instagram accounts for the workspace
    const workspaceId = '686d98d34888852d5d7beb6c'; // arpit9996363 workspace
    
    console.log(`\n📊 Searching for Instagram accounts in workspace: ${workspaceId}`);
    
    const accounts = await collection.find({
      $or: [
        { workspaceId: workspaceId },
        { workspaceId: { $regex: workspaceId.substring(0, 12) } } // Handle truncated IDs
      ],
      platform: 'instagram'
    }).toArray();
    
    console.log(`\n📸 Found ${accounts.length} Instagram accounts:`);
    
    accounts.forEach((account, index) => {
      console.log(`\n--- Account ${index + 1} ---`);
      console.log(`ID: ${account._id}`);
      console.log(`Username: ${account.username}`);
      console.log(`Display Name: ${account.displayName}`);
      console.log(`Total Shares: ${account.totalShares}`);
      console.log(`Total Saves: ${account.totalSaves}`);
      console.log(`Total Likes: ${account.totalLikes}`);
      console.log(`Total Comments: ${account.totalComments}`);
      console.log(`Posts Analyzed: ${account.postsAnalyzed}`);
      console.log(`Last Sync: ${account.lastSync}`);
      console.log(`Updated At: ${account.updatedAt}`);
    });
    
    // Check for the account showing 16 shares
    const accountWith16 = accounts.find(acc => acc.totalShares === 16);
    if (accountWith16) {
      console.log('\n🚨 FOUND ACCOUNT WITH 16 SHARES IN DATABASE:');
      console.log(`Username: ${accountWith16.username}`);
      console.log(`This is why the UI shows 16 shares!`);
      console.log(`Last updated: ${accountWith16.updatedAt}`);
    }
    
    // Check for the account with 2 shares
    const accountWith2 = accounts.find(acc => acc.totalShares === 2);
    if (accountWith2) {
      console.log('\n✅ FOUND ACCOUNT WITH 2 SHARES IN DATABASE:');
      console.log(`Username: ${accountWith2.username}`);
      console.log(`Last updated: ${accountWith2.updatedAt}`);
    }
    
    // Check if there are multiple accounts that might be causing confusion
    if (accounts.length > 1) {
      console.log('\n⚠️ MULTIPLE ACCOUNTS DETECTED:');
      console.log('The UI might be showing data from a different account than expected.');
      console.log('Check which account the frontend is actually displaying.');
    }
    
  } catch (error) {
    console.error('❌ Error checking database:', error);
  } finally {
    if (client) {
      await client.close();
    }
  }
}

debugDatabaseShares();