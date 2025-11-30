const { MongoClient } = require('mongodb');

async function debugWorkspaceAccounts() {
  console.log('🔍 Checking workspace accounts...\n');
  
  let client;
  try {
    // Connect to MongoDB
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/veefore';
    client = new MongoClient(uri);
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db();
    
    // Get all social accounts
    const accounts = await db.collection('socialAccounts').find({}).toArray();
    console.log(`📊 Found ${accounts.length} social accounts\n`);
    
    // Group by workspace
    const workspaceMap = {};
    accounts.forEach(account => {
      const workspaceId = account.workspaceId?.toString() || 'no-workspace';
      if (!workspaceMap[workspaceId]) {
        workspaceMap[workspaceId] = [];
      }
      workspaceMap[workspaceId].push(account);
    });
    
    console.log('📋 Accounts by workspace:');
    Object.entries(workspaceMap).forEach(([workspaceId, accounts]) => {
      console.log(`\n🏢 Workspace: ${workspaceId}`);
      accounts.forEach(account => {
        console.log(`  📱 ${account.platform}: ${account.username || account.name || 'unnamed'}`);
        console.log(`     - Has access token: ${!!account.accessToken || !!account.encryptedAccessToken}`);
        console.log(`     - Total shares: ${account.totalShares || 0}`);
        console.log(`     - Total saves: ${account.totalSaves || 0}`);
        console.log(`     - Posts analyzed: ${account.postsAnalyzed || 0}`);
      });
    });
    
    // Find Instagram accounts with tokens
    const igAccountsWithTokens = accounts.filter(account => 
      account.platform === 'instagram' && 
      (account.accessToken || account.encryptedAccessToken)
    );
    
    console.log(`\n🎯 Instagram accounts with tokens: ${igAccountsWithTokens.length}`);
    if (igAccountsWithTokens.length > 0) {
      console.log('📝 Recommended workspace IDs for testing:');
      igAccountsWithTokens.forEach(account => {
        console.log(`  - Workspace: ${account.workspaceId?.toString()}`);
        console.log(`    Account: ${account.username || 'unnamed'}`);
        console.log(`    Has encrypted token: ${!!account.encryptedAccessToken}`);
        console.log('');
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    if (client) {
      await client.close();
      console.log('🔌 Disconnected from MongoDB');
    }
  }
}

debugWorkspaceAccounts().catch(console.error);