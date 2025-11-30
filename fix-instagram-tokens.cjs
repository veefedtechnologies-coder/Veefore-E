const { MongoClient } = require('mongodb');

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

class InstagramTokenFixer {
  constructor() {
    this.client = null;
    this.db = null;
  }

  async connect() {
    try {
      this.client = new MongoClient(MONGODB_URI);
      await this.client.connect();
      this.db = this.client.db('veeforedb');
      console.log('✅ Connected to MongoDB');
    } catch (error) {
      console.error('❌ MongoDB connection failed:', error);
      throw error;
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.close();
      console.log('✅ Disconnected from MongoDB');
    }
  }

  async findInvalidTokens() {
    console.log('\n🔍 Scanning for Instagram accounts with invalid tokens...\n');
    
    const socialAccounts = this.db.collection('socialAccounts');
    const instagramAccounts = await socialAccounts.find({ platform: 'instagram' }).toArray();
    
    console.log(`Found ${instagramAccounts.length} Instagram account(s)`);
    
    const invalidAccounts = [];
    
    for (const account of instagramAccounts) {
      console.log(`\n📋 Analyzing account: @${account.username}`);
      console.log(`   Account ID: ${account.accountId}`);
      console.log(`   Workspace ID: ${account.workspaceId}`);
      
      // Check for invalid tokens
      const hasPlainToken = !!account.accessToken;
      const hasEncryptedToken = !!account.encryptedAccessToken;
      const isTestToken = account.accessToken === 'test_access_token';
      const isShortToken = account.accessToken && account.accessToken.length < 50;
      
      console.log(`   Has plain token: ${hasPlainToken}`);
      console.log(`   Has encrypted token: ${hasEncryptedToken}`);
      console.log(`   Is test token: ${isTestToken}`);
      console.log(`   Token length: ${account.accessToken ? account.accessToken.length : 'N/A'}`);
      
      let status = 'VALID';
      let issues = [];
      
      if (isTestToken) {
        status = 'INVALID';
        issues.push('Test/placeholder token');
      }
      
      if (isShortToken && !isTestToken) {
        status = 'SUSPICIOUS';
        issues.push('Token too short for Instagram');
      }
      
      if (!hasPlainToken && !hasEncryptedToken) {
        status = 'INVALID';
        issues.push('No token available');
      }
      
      console.log(`   Status: ${status}`);
      if (issues.length > 0) {
        console.log(`   Issues: ${issues.join(', ')}`);
      }
      
      if (status !== 'VALID') {
        invalidAccounts.push({
          ...account,
          status,
          issues
        });
      }
    }
    
    return invalidAccounts;
  }

  async fixInvalidTokens(invalidAccounts) {
    console.log(`\n🔧 Found ${invalidAccounts.length} account(s) with invalid tokens\n`);
    
    if (invalidAccounts.length === 0) {
      console.log('✅ No invalid tokens found. All accounts are properly configured.');
      return;
    }
    
    const socialAccounts = this.db.collection('socialAccounts');
    
    for (const account of invalidAccounts) {
      console.log(`\n🔄 Processing @${account.username}:`);
      console.log(`   Issues: ${account.issues.join(', ')}`);
      
      if (account.issues.includes('Test/placeholder token')) {
        console.log('   Action: Removing test token and marking for reconnection');
        
        // Remove the invalid token and mark account as needing reconnection
        await socialAccounts.updateOne(
          { _id: account._id },
          {
            $unset: { 
              accessToken: "",
              refreshToken: ""
            },
            $set: {
              isActive: false,
              needsReconnection: true,
              lastError: 'Invalid access token - requires OAuth reconnection',
              updatedAt: new Date()
            }
          }
        );
        
        console.log('   ✅ Test token removed, account marked for reconnection');
      }
      
      if (account.issues.includes('No token available')) {
        console.log('   Action: Marking account as inactive');
        
        await socialAccounts.updateOne(
          { _id: account._id },
          {
            $set: {
              isActive: false,
              needsReconnection: true,
              lastError: 'No access token available - requires OAuth reconnection',
              updatedAt: new Date()
            }
          }
        );
        
        console.log('   ✅ Account marked as inactive and needing reconnection');
      }
    }
  }

  async generateReconnectionInstructions(invalidAccounts) {
    console.log('\n📋 RECONNECTION INSTRUCTIONS:\n');
    
    if (invalidAccounts.length === 0) {
      console.log('✅ No accounts need reconnection.');
      return;
    }
    
    console.log('The following Instagram accounts need to be reconnected:');
    
    for (const account of invalidAccounts) {
      console.log(`\n👤 @${account.username}`);
      console.log(`   Workspace ID: ${account.workspaceId}`);
      console.log(`   Issues: ${account.issues.join(', ')}`);
      console.log(`   Action Required: Go to Integrations page and reconnect this Instagram account`);
    }
    
    console.log('\n🔗 To reconnect:');
    console.log('1. Go to your app\'s Integrations page');
    console.log('2. Find the Instagram section');
    console.log('3. Click "Connect Instagram" or "Reconnect"');
    console.log('4. Complete the OAuth flow with Instagram');
    console.log('5. The system will automatically sync your data');
    
    console.log('\n⚠️  Important Notes:');
    console.log('- Make sure you\'re logged into the correct Instagram account');
    console.log('- Ensure your Instagram account is a Business or Creator account');
    console.log('- The OAuth process will generate a real, valid access token');
    console.log('- After reconnection, shares and saves data should appear correctly');
  }

  async run() {
    try {
      await this.connect();
      
      console.log('🚀 Instagram Token Fixer - Starting Analysis\n');
      
      // Find accounts with invalid tokens
      const invalidAccounts = await this.findInvalidTokens();
      
      // Fix the invalid tokens
      await this.fixInvalidTokens(invalidAccounts);
      
      // Generate reconnection instructions
      await this.generateReconnectionInstructions(invalidAccounts);
      
      console.log('\n✅ Token analysis and fixes completed successfully!');
      
    } catch (error) {
      console.error('\n❌ Error during token fixing process:', error);
      throw error;
    } finally {
      await this.disconnect();
    }
  }
}

// Run the fixer
async function main() {
  const fixer = new InstagramTokenFixer();
  await fixer.run();
}

main().catch(console.error);