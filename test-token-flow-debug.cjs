const { MongoClient } = require('mongodb');
const { TokenEncryptionService } = require('./server/dist/server/security/token-encryption');

const MONGODB_URI = 'mongodb://localhost:27017/veeforedb';

// Initialize token encryption with the same key as the server
const masterKey = process.env.TOKEN_ENCRYPTION_KEY || 'your-32-character-master-key-here';
const tokenEncryption = new TokenEncryptionService(masterKey);

async function testTokenFlow() {
  let client;
  
  try {
    console.log('🔍 Testing token flow for getSocialAccountsByWorkspace...');
    
    // Connect to MongoDB
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db('veeforedb');
    const collection = db.collection('socialaccounts');
    
    // Find the Instagram account
    const account = await collection.findOne({ 
      username: 'rahulc1020',
      platform: 'instagram'
    });
    
    if (!account) {
      console.log('❌ Instagram account not found');
      return;
    }
    
    console.log('\n📊 Raw Account from Database:');
    console.log('Username:', account.username);
    console.log('Has encryptedAccessToken:', !!account.encryptedAccessToken);
    console.log('Has accessToken:', !!account.accessToken);
    console.log('encryptedAccessToken type:', typeof account.encryptedAccessToken);
    
    // Step 1: Simulate getSocialAccountsByWorkspace decryption
    console.log('\n🔓 Step 1: Simulating getSocialAccountsByWorkspace decryption...');
    
    if (account.encryptedAccessToken && !account.accessToken) {
      try {
        // Parse JSON string if needed
        const encryptedTokenObj = typeof account.encryptedAccessToken === 'string' 
          ? JSON.parse(account.encryptedAccessToken) 
          : account.encryptedAccessToken;
        
        const decryptedToken = tokenEncryption.decryptToken(encryptedTokenObj);
        account.accessToken = decryptedToken;
        console.log(`✅ Decrypted access token for ${account.username} (length: ${decryptedToken.length})`);
      } catch (err) {
        console.error(`❌ Failed to decrypt access token for ${account.username}:`, err.message);
      }
    }
    
    console.log('\n📊 Account After getSocialAccountsByWorkspace Processing:');
    console.log('Has encryptedAccessToken:', !!account.encryptedAccessToken);
    console.log('Has accessToken:', !!account.accessToken);
    console.log('accessToken length:', account.accessToken ? account.accessToken.length : 'N/A');
    
    // Step 2: Simulate getAccessTokenFromAccount logic
    console.log('\n🔍 Step 2: Simulating getAccessTokenFromAccount logic...');
    
    // This is the problematic logic from getAccessTokenFromAccount
    console.log('Checking conditions:');
    console.log('- !account.encryptedAccessToken:', !account.encryptedAccessToken);
    console.log('- account.accessToken exists:', !!account.accessToken);
    console.log('- Will attempt migration?', !account.encryptedAccessToken && account.accessToken);
    
    if (!account.encryptedAccessToken && account.accessToken) {
      console.log('⚠️  ISSUE FOUND: getAccessTokenFromAccount will try to migrate the already-decrypted token!');
      console.log('This will fail because the token is already decrypted, not a raw token to encrypt.');
    } else if (account.encryptedAccessToken) {
      console.log('✅ getAccessTokenFromAccount will decrypt from encryptedAccessToken');
      try {
        const decryptedToken = tokenEncryption.decryptToken(
          typeof account.encryptedAccessToken === 'string' 
            ? JSON.parse(account.encryptedAccessToken) 
            : account.encryptedAccessToken
        );
        console.log(`✅ Successfully decrypted token (length: ${decryptedToken.length})`);
      } catch (err) {
        console.error(`❌ Failed to decrypt:`, err.message);
      }
    }
    
    console.log('\n🎯 CONCLUSION:');
    console.log('The issue is that getSocialAccountsByWorkspace decrypts tokens and stores them in account.accessToken,');
    console.log('but getAccessTokenFromAccount expects to decrypt from encryptedAccessToken.');
    console.log('There\'s a mismatch in the token handling flow.');
    
  } catch (error) {
    console.error('❌ Error during token flow test:', error);
  } finally {
    if (client) {
      await client.close();
      console.log('🔌 Disconnected from MongoDB');
    }
  }
}

testTokenFlow().catch(console.error);