const { MongoClient } = require('mongodb');

async function findWorkspaceForAccount() {
  console.log('🔍 Finding workspace IDs for Instagram accounts...');
  
  const client = new MongoClient('mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0');
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db('veeforedb');
    
    // Get all social accounts
    const socialAccounts = await db.collection('socialaccounts').find({}).toArray();
    console.log(`📊 Found ${socialAccounts.length} social accounts total`);
    
    // Filter Instagram accounts
    const instagramAccounts = socialAccounts.filter(acc => acc.platform === 'instagram');
    console.log(`📱 Found ${instagramAccounts.length} Instagram accounts`);
    
    for (const account of instagramAccounts) {
      console.log(`\n👤 Instagram Account: @${account.username}`);
      console.log(`   - Account ID: ${account._id}`);
      console.log(`   - Workspace ID: ${account.workspaceId}`);
      console.log(`   - Platform: ${account.platform}`);
      console.log(`   - Is Active: ${account.isActive}`);
      console.log(`   - Has Encrypted Token: ${!!account.encryptedAccessToken}`);
      console.log(`   - Last Sync: ${account.lastSyncAt}`);
      console.log(`   - Followers: ${account.followersCount}`);
      console.log(`   - Posts Analyzed: ${account.postsAnalyzed}`);
      console.log(`   - Total Likes: ${account.totalLikes}`);
      console.log(`   - Total Comments: ${account.totalComments}`);
    }
    
    // Get all workspaces
    console.log('\n🏢 All Workspaces:');
    const workspaces = await db.collection('workspaces').find({}).toArray();
    
    for (const workspace of workspaces) {
      console.log(`\n🏢 Workspace: ${workspace.name || 'Unnamed'}`);
      console.log(`   - ID: ${workspace._id}`);
      console.log(`   - User ID: ${workspace.userId}`);
      console.log(`   - Is Default: ${workspace.isDefault}`);
      
      // Find accounts for this workspace
      const accountsInWorkspace = instagramAccounts.filter(acc => 
        acc.workspaceId === workspace._id.toString() || 
        acc.workspaceId === workspace._id
      );
      
      if (accountsInWorkspace.length > 0) {
        console.log(`   - Instagram Accounts: ${accountsInWorkspace.map(acc => '@' + acc.username).join(', ')}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
    console.log('🔌 Disconnected from MongoDB');
  }
}

findWorkspaceForAccount().catch(console.error);