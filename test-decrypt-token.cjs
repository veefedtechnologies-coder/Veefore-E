const { MongoClient } = require('mongodb');
const fetch = require('node-fetch');

const MONGODB_URI = 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

// Import the tokenEncryption service the same way as the working validator
const { tokenEncryption } = require('./server/security/token-encryption.js');

async function testTokenDecryption() {
  console.log('🔍 Testing token decryption for rahulc1020...\n');
  
  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
    const db = client.db('veeforedb');
    
    // Find the rahulc1020 account
    const account = await db.collection('socialaccounts').findOne({
      username: 'rahulc1020',
      platform: 'instagram'
    });
    
    if (!account) {
      console.log('❌ Account not found');
      return;
    }
    
    console.log('📊 Account Details:');
    console.log('Username:', account.username);
    console.log('Account ID:', account.accountId);
    console.log('Has encryptedAccessToken:', !!account.encryptedAccessToken);
    console.log('Has accessToken:', !!account.accessToken);
    console.log('');
    
    if (account.encryptedAccessToken) {
      try {
        console.log('🔓 Attempting to decrypt access token...');
        console.log('Encrypted token type:', typeof account.encryptedAccessToken);
        console.log('Encrypted token value:', account.encryptedAccessToken);
        
        let encryptedData;
        
        // Check if it's already an object or needs parsing
        if (typeof account.encryptedAccessToken === 'string') {
          try {
            encryptedData = JSON.parse(account.encryptedAccessToken);
          } catch (parseError) {
            console.log('❌ Failed to parse encrypted token as JSON:', parseError.message);
            return;
          }
        } else {
          encryptedData = account.encryptedAccessToken;
        }
        
        console.log('Encrypted token structure:', Object.keys(encryptedData));
        
        // Use the tokenEncryption service directly
        const decryptedToken = tokenEncryption.decryptToken(encryptedData);
        
        console.log('✅ Token decrypted successfully!');
        console.log('Token length:', decryptedToken.length);
        console.log('Token preview:', decryptedToken.substring(0, 20) + '...');
        
        // Test the decrypted token with Instagram API
        console.log('\n🔍 Testing decrypted token with Instagram API...');
        
        const testUrl = `https://graph.instagram.com/me?fields=id,username,account_type&access_token=${decryptedToken}`;
        const response = await fetch(testUrl);
        const data = await response.json();
        
        if (response.ok) {
          console.log('✅ Token is valid! Account info:', JSON.stringify(data, null, 2));
          
          // Now test reach insights
          console.log('\n📊 Testing reach insights...');
          const reachUrl = `https://graph.instagram.com/${account.accountId}/insights?metric=reach&period=day&access_token=${decryptedToken}`;
          const reachResponse = await fetch(reachUrl);
          const reachData = await reachResponse.json();
          
          if (reachResponse.ok) {
            console.log('✅ Reach data retrieved successfully:', JSON.stringify(reachData, null, 2));
          } else {
            console.log('❌ Reach API error:', reachData);
          }
          
        } else {
          console.log('❌ Token validation failed:', data);
        }
        
      } catch (error) {
        console.log('❌ Token decryption failed:', error.message);
        console.log('Error details:', error);
      }
    } else {
      console.log('❌ No encrypted access token found');
    }
    
  } catch (error) {
    console.error('❌ Database error:', error);
  } finally {
    await client.close();
  }
}

testTokenDecryption();