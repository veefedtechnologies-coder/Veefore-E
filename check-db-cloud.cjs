const { MongoStorage } = require('./server/mongodb-storage.js');

async function checkDatabase() {
  console.log('🔍 Checking cloud MongoDB database...');
  
  try {
    // Use the cloud MongoDB URI from the environment
    const mongoUri = 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
    
    const storage = new MongoStorage(mongoUri);
    await storage.connect();
    
    console.log('✅ Connected to cloud MongoDB successfully');
    
    const accounts = await storage.getAllSocialAccounts();
    console.log(`📊 Found ${accounts.length} social accounts:`);
    
    accounts.forEach((account, index) => {
      console.log(`\n${index + 1}. ${account.platform} - ${account.username || account.name}`);
      console.log(`   Account ID: ${account.accountId}`);
      console.log(`   Workspace ID: ${account.workspaceId}`);
      console.log(`   Total Shares: ${account.totalShares || 0}`);
      console.log(`   Total Saves: ${account.totalSaves || 0}`);
      console.log(`   Posts Analyzed: ${account.postsAnalyzed || 0}`);
      console.log(`   Last Sync: ${account.lastSync || 'Never'}`);
      console.log(`   Has Access Token: ${account.accessToken ? 'Yes' : 'No'}`);
      if (account.accessToken) {
        console.log(`   Token Length: ${account.accessToken.length} chars`);
      }
    });
    
    // Check for Instagram accounts specifically
    const instagramAccounts = accounts.filter(acc => acc.platform === 'instagram');
    console.log(`\n📸 Instagram accounts: ${instagramAccounts.length}`);
    
    if (instagramAccounts.length > 0) {
      console.log('\n🔍 Instagram account details:');
      instagramAccounts.forEach((account, index) => {
        console.log(`\n  ${index + 1}. @${account.username}`);
        console.log(`     Workspace: ${account.workspaceId}`);
        console.log(`     Shares: ${account.totalShares || 0}`);
        console.log(`     Saves: ${account.totalSaves || 0}`);
        console.log(`     Posts: ${account.postsAnalyzed || 0}`);
        console.log(`     Token: ${account.accessToken ? 'Present' : 'Missing'}`);
      });
    }
    
    await storage.disconnect();
    console.log('\n✅ Database check completed');
    
  } catch (error) {
    console.error('❌ Database check failed:', error.message);
    process.exit(1);
  }
}

checkDatabase();