const mongoose = require('mongoose');
const crypto = require('crypto');

// MongoDB connection string from .env
const mongoUri = 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function checkInstagramAccounts() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(mongoUri, {
      dbName: 'veeforedb',
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      bufferCommands: false,
      maxIdleTimeMS: 30000,
      retryWrites: true
    });
    console.log('✅ Connected to MongoDB - veeforedb database');

    // Check socialaccounts collection for Instagram accounts
    const SocialAccount = mongoose.model('SocialAccount', new mongoose.Schema({}, { strict: false }));
    
    console.log('\n📊 Checking Instagram accounts in socialaccounts collection...');
    const instagramAccounts = await SocialAccount.find({ platform: 'instagram' });
    
    console.log(`Found ${instagramAccounts.length} Instagram accounts:`);
    
    for (const account of instagramAccounts) {
      console.log('\n' + '='.repeat(50));
      console.log(`Account ID: ${account._id}`);
      console.log(`Workspace ID: ${account.workspaceId}`);
      console.log(`Username: ${account.username || 'N/A'}`);
      console.log(`Platform: ${account.platform}`);
      console.log(`Active: ${account.isActive}`);
      console.log(`Needs Reconnection: ${account.needsReconnection || false}`);
      console.log(`Has Access Token: ${!!account.accessToken}`);
      console.log(`Has Encrypted Access Token: ${!!account.encryptedAccessToken}`);
      console.log(`Has Refresh Token: ${!!account.refreshToken}`);
      console.log(`Has Encrypted Refresh Token: ${!!account.encryptedRefreshToken}`);
      console.log(`Follower Count: ${account.followerCount || 0}`);
      console.log(`Engagement Rate: ${account.engagementRate || 0}`);
      console.log(`Last Sync: ${account.lastSync || 'Never'}`);
      console.log(`Created At: ${account.createdAt}`);
      console.log(`Updated At: ${account.updatedAt}`);
      
      // Check if encrypted tokens exist and try to decrypt
      if (account.encryptedAccessToken) {
        try {
          const encryptedData = JSON.parse(account.encryptedAccessToken);
          console.log(`Encrypted Token Structure: ${JSON.stringify(Object.keys(encryptedData))}`);
        } catch (e) {
          console.log('Encrypted Token: Invalid JSON format');
        }
      }
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('Summary:');
    console.log(`Total Instagram accounts: ${instagramAccounts.length}`);
    console.log(`Active accounts: ${instagramAccounts.filter(a => a.isActive).length}`);
    console.log(`Accounts needing reconnection: ${instagramAccounts.filter(a => a.needsReconnection).length}`);
    console.log(`Accounts with access tokens: ${instagramAccounts.filter(a => a.accessToken).length}`);
    console.log(`Accounts with encrypted tokens: ${instagramAccounts.filter(a => a.encryptedAccessToken).length}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

checkInstagramAccounts();
