/**
 * Test Token Health Check for arpit.10 account
 * This script will attempt to use the tokenHealthCheck logic to fix the encrypted token
 */

const { MongoClient } = require('mongodb');
// Import the tokenEncryption service
const { tokenEncryption } = require('./server/security/token-encryption.js');

const MONGODB_URI = 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function testTokenHealthCheck() {
  let client;
  
  try {
    console.log('🔍 Testing token health check for arpit.10...');
    
    // Connect to MongoDB
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db('veeforedb');
    const collection = db.collection('socialaccounts');
    
    // Find the arpit.10 account
    const account = await collection.findOne({ username: 'arpit.10' });
    
    if (!account) {
      console.log('❌ Account arpit.10 not found');
      return;
    }
    
    console.log('\n📊 Account Details:');
    console.log('Username:', account.username);
    console.log('Account ID:', account.accountId);
    console.log('Has encryptedAccessToken:', !!account.encryptedAccessToken);
    console.log('Has accessToken:', !!account.accessToken);
    
    // Simulate the tokenHealthCheck logic
    let fixedToken = null;
    
    // Try to decrypt the accessToken field (if it contains encrypted data)
    if (account.accessToken && account.accessToken.includes && account.accessToken.includes('aes-256-gcm:')) {
      try {
        console.log('\n🔓 Attempting to decrypt accessToken field...');
        fixedToken = tokenEncryption.decryptToken(account.accessToken);
        console.log('✅ Successfully decrypted accessToken field!');
      } catch (decryptError) {
        console.error('❌ Failed to decrypt accessToken field:', decryptError.message);
      }
    }
    
    // Try to decrypt the encryptedAccessToken field
    if (!fixedToken && account.encryptedAccessToken) {
      try {
        console.log('\n🔓 Attempting to decrypt encryptedAccessToken field...');
        console.log('Encrypted token type:', typeof account.encryptedAccessToken);
        
        let encryptedData = account.encryptedAccessToken;
        
        // Handle different formats
        if (typeof encryptedData === 'string') {
          try {
            encryptedData = JSON.parse(encryptedData);
          } catch (parseError) {
            console.log('Encrypted data is already a string, not JSON');
          }
        }
        
        console.log('Encrypted token structure:', Object.keys(encryptedData));
        
        fixedToken = tokenEncryption.decryptToken(encryptedData);
        console.log('✅ Successfully decrypted encryptedAccessToken field!');
      } catch (decryptError) {
        console.error('❌ Failed to decrypt encryptedAccessToken field:', decryptError.message);
      }
    }
    
    if (fixedToken) {
      console.log('\n🎉 Token successfully decrypted!');
      console.log('Token length:', fixedToken.length);
      console.log('Token preview:', fixedToken.substring(0, 20) + '...');
      
      // Test the token with Instagram API
      console.log('\n🧪 Testing token with Instagram API...');
      try {
        const fetch = require('node-fetch');
        const response = await fetch(`https://graph.instagram.com/me?fields=id,username&access_token=${fixedToken}`);
        const data = await response.json();
        
        if (response.ok) {
          console.log('✅ Token is valid! Instagram API response:', data);
          
          // Update the database with the fixed token
          console.log('\n💾 Updating database with fixed token...');
          const updateResult = await collection.updateOne(
            { _id: account._id },
            {
              $set: {
                accessToken: fixedToken,
                lastTokenFix: new Date()
              },
              $unset: {
                encryptedAccessToken: ""
              }
            }
          );
          
          console.log('✅ Database updated successfully:', updateResult.modifiedCount, 'document(s) modified');
        } else {
          console.error('❌ Token is invalid. Instagram API error:', data);
        }
      } catch (apiError) {
        console.error('❌ Error testing token with Instagram API:', apiError.message);
      }
    } else {
      console.log('\n❌ Could not decrypt any token for this account');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    if (client) {
      await client.close();
      console.log('\n🔌 Disconnected from MongoDB');
    }
  }
}

testTokenHealthCheck();