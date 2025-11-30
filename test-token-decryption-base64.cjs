require('dotenv').config();
const { MongoClient } = require('mongodb');
const crypto = require('crypto');
const axios = require('axios');

// Encryption configuration (matching the system)
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;

class TokenEncryptionService {
  constructor() {
    this.masterKey = process.env.TOKEN_ENCRYPTION_KEY;
    if (!this.masterKey) {
      throw new Error('TOKEN_ENCRYPTION_KEY not found in environment');
    }
    console.log('🔑 Using master key length:', this.masterKey.length);
  }

  deriveKey(salt) {
    return crypto.pbkdf2Sync(this.masterKey, salt, 100000, KEY_LENGTH, 'sha256');
  }

  decryptToken(encryptedToken) {
    try {
      console.log('🔓 Attempting to decrypt token with base64 encoding...');
      
      const { encryptedData, iv, salt, tag } = encryptedToken;

      if (!encryptedData || !iv || !salt || !tag) {
        throw new Error('Missing required encryption components');
      }

      console.log('  Has all components: ✅');

      // Convert from base64 strings to buffers (not hex!)
      const ivBuffer = Buffer.from(iv, 'base64');
      const saltBuffer = Buffer.from(salt, 'base64');
      const tagBuffer = Buffer.from(tag, 'base64');
      const encryptedBuffer = Buffer.from(encryptedData, 'base64');

      console.log('  Buffer lengths - IV:', ivBuffer.length, 'Salt:', saltBuffer.length, 'Tag:', tagBuffer.length);

      // Derive key
      const key = this.deriveKey(saltBuffer);
      console.log('  Key derived successfully');

      // Create decipher
      const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer);
      decipher.setAuthTag(tagBuffer);

      console.log('  Decipher created');

      // Decrypt
      let decrypted = decipher.update(encryptedBuffer, null, 'utf8');
      decrypted += decipher.final('utf8');

      console.log('  ✅ Decryption successful');
      return decrypted;

    } catch (error) {
      console.log('  ❌ Decryption failed:', error.message);
      console.log('  Error details:', {
        name: error.name,
        code: error.code
      });
      return null;
    }
  }
}

async function testTokenDecryptionAndStoriesAPI() {
  console.log('🔍 Testing token decryption and Instagram Stories API...');
  
  const client = new MongoClient('mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0');
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db('veeforedb');
    const collection = db.collection('socialaccounts');
    
    // Find the arpit.10 Instagram account
    const account = await collection.findOne({
      username: 'arpit.10',
      platform: 'instagram'
    });
    
    if (!account) {
      console.log('❌ No arpit.10 Instagram account found');
      return;
    }
    
    console.log('📱 Found Instagram account:');
    console.log('  Username:', account.username);
    console.log('  Account ID:', account.accountId);
    console.log('  Workspace ID:', account.workspaceId);
    
    // Test decryption
    const tokenService = new TokenEncryptionService();
    const decryptedToken = tokenService.decryptToken(account.encryptedAccessToken);
    
    if (decryptedToken) {
      console.log('✅ Token decrypted successfully!');
      console.log('  Token length:', decryptedToken.length);
      console.log('  Token preview:', decryptedToken.substring(0, 30) + '...');
      
      // Now test the Instagram Stories API
      console.log('\n📊 Testing Instagram Stories API with decrypted token...');
      
      const storiesUrl = `https://graph.instagram.com/me/stories`;
      const params = {
        fields: 'id,media_type,media_url,timestamp,like_count,comments_count,shares_count,saves_count,reach,replies_count,product_type',
        access_token: decryptedToken
      };
      
      console.log('  URL:', storiesUrl);
      console.log('  Fields:', params.fields);
      
      try {
        const response = await axios.get(storiesUrl, { params });
        
        console.log('✅ Stories API Response:');
        console.log('  Status:', response.status);
        console.log('  Data structure:', Object.keys(response.data));
        
        if (response.data && response.data.data) {
          console.log(`\n📈 Stories found: ${response.data.data.length}`);
          
          if (response.data.data.length > 0) {
            console.log('\n📋 Story details:');
            response.data.data.forEach((story, index) => {
              console.log(`  ${index + 1}. Story ID: ${story.id}`);
              console.log(`     Media Type: ${story.media_type}`);
              console.log(`     Product Type: ${story.product_type || 'N/A'}`);
              console.log(`     Timestamp: ${story.timestamp}`);
              console.log(`     Like Count: ${story.like_count || 0}`);
              console.log(`     Replies Count: ${story.replies_count || 0}`);
              console.log('');
            });
          } else {
            console.log('  ℹ️ No stories found. Possible reasons:');
            console.log('    - Account has no active stories (stories expire after 24 hours)');
            console.log('    - Account is not a business/creator account');
            console.log('    - Access token lacks proper permissions');
          }
        }
        
        // Test basic account info to verify token works
        console.log('\n🔍 Testing basic account info to verify token...');
        const accountUrl = `https://graph.instagram.com/me`;
        const accountParams = {
          fields: 'id,username,account_type,media_count',
          access_token: decryptedToken
        };
        
        try {
          const accountResponse = await axios.get(accountUrl, { params: accountParams });
          console.log('✅ Account info retrieved:');
          console.log('  ID:', accountResponse.data.id);
          console.log('  Username:', accountResponse.data.username);
          console.log('  Account Type:', accountResponse.data.account_type);
          console.log('  Media Count:', accountResponse.data.media_count);
        } catch (accountError) {
          console.log('❌ Account info error:', accountError.response?.data);
        }
        
      } catch (apiError) {
        console.log('❌ Stories API Error:');
        console.log('  Status:', apiError.response?.status);
        console.log('  Status Text:', apiError.response?.statusText);
        console.log('  Error Data:', JSON.stringify(apiError.response?.data, null, 2));
        
        if (apiError.response?.status === 400) {
          console.log('\n💡 Possible reasons for 400 error:');
          console.log('  - Account is not a business/creator account');
          console.log('  - Access token lacks instagram_basic or instagram_manage_insights permissions');
          console.log('  - Stories endpoint requires specific account type');
        }
      }
      
    } else {
      console.log('❌ Token decryption failed');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

testTokenDecryptionAndStoriesAPI().catch(console.error);