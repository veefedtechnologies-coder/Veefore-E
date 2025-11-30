const mongoose = require('mongoose');

async function checkDatabaseDirect() {
  console.log('🔍 Checking cloud MongoDB database directly...');
  
  try {
    // Use the cloud MongoDB URI directly
    const mongoUri = 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/veeforedb?retryWrites=true&w=majority&appName=Cluster0';
    
    console.log('🔗 Connecting to:', mongoUri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@'));
    
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      bufferCommands: false,
      maxIdleTimeMS: 30000,
      retryWrites: true
    });
    
    console.log('✅ Connected to cloud MongoDB successfully');
    console.log('📊 Database:', mongoose.connection.db.databaseName);
    
    // Define the schema for social accounts
    const socialAccountSchema = new mongoose.Schema({}, { strict: false });
    const SocialAccount = mongoose.model('SocialAccount', socialAccountSchema, 'socialaccounts');
    
    const accounts = await SocialAccount.find({}).lean();
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
        console.log(`   Token Preview: ${account.accessToken.substring(0, 20)}...`);
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
        console.log(`     Last Sync: ${account.lastSync || 'Never'}`);
      });
      
      // Check workspaces collection
      const workspaceSchema = new mongoose.Schema({}, { strict: false });
      const Workspace = mongoose.model('Workspace', workspaceSchema, 'workspaces');
      
      const workspaces = await Workspace.find({}).lean();
      console.log(`\n🏢 Found ${workspaces.length} workspaces:`);
      
      workspaces.forEach((workspace, index) => {
        console.log(`\n  ${index + 1}. ${workspace.name || 'Unnamed'}`);
        console.log(`     ID: ${workspace._id}`);
        console.log(`     Owner: ${workspace.ownerId}`);
        console.log(`     Created: ${workspace.createdAt || 'Unknown'}`);
      });
    }
    
    await mongoose.disconnect();
    console.log('\n✅ Database check completed');
    
  } catch (error) {
    console.error('❌ Database check failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  }
}

checkDatabaseDirect();