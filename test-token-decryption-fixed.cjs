require('dotenv').config();
const { MongoClient } = require('mongodb');
const crypto = require('crypto');

// Encryption configuration (matching the system)
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const SALT_LENGTH = 32;
const TAG_LENGTH = 16;

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
      console.log('🔓 Attempting to decrypt token...');
      console.log('  Token type:', typeof encryptedToken);
      console.log('  Token structure:', Object.keys(encryptedToken));

      const { encryptedData, iv, salt, tag } = encryptedToken;

      if (!encryptedData || !iv || !salt || !tag) {
        throw new Error('Missing required encryption components');
      }

      console.log('  Has all components: ✅');
      console.log('  IV length:', iv.length);
      console.log('  Salt length:', salt.length);
      console.log('  Tag length:', tag.length);
      console.log('  EncryptedData length:', encryptedData.length);

      // Convert from hex strings to buffers
      const ivBuffer = Buffer.from(iv, 'hex');
      const saltBuffer = Buffer.from(salt, 'hex');
      const tagBuffer = Buffer.from(tag, 'hex');
      const encryptedBuffer = Buffer.from(encryptedData, 'hex');

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
        code: error.code,
        stack: error.stack?.split('\n')[0]
      });
      return null;
    }
  }
}

async function testTokenDecryption() {
  console.log('🔍 Testing token decryption with proper environment loading...');
  
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
    console.log('  Has encryptedAccessToken:', !!account.encryptedAccessToken);
    console.log('  EncryptedAccessToken type:', typeof account.encryptedAccessToken);
    
    if (typeof account.encryptedAccessToken === 'object') {
      console.log('  EncryptedAccessToken keys:', Object.keys(account.encryptedAccessToken));
    }
    
    // Test decryption
    const tokenService = new TokenEncryptionService();
    const decryptedToken = tokenService.decryptToken(account.encryptedAccessToken);
    
    if (decryptedToken) {
      console.log('✅ Token decrypted successfully!');
      console.log('  Token length:', decryptedToken.length);
      console.log('  Token preview:', decryptedToken.substring(0, 20) + '...');
      
      // Now test the Instagram Stories API
      console.log('\n📊 Testing Instagram Stories API with decrypted token...');
      
      const axios = require('axios');
      const storiesUrl = `https://graph.instagram.com/me/stories`;
      const params = {
        fields: 'id,media_type,media_url,timestamp,like_count,comments_count,shares_count,saves_count,reach,replies_count,product_type',
        access_token: decryptedToken
      };
      
      try {
        const response = await axios.get(storiesUrl, { params });
        
        console.log('✅ Stories API Response:');
        console.log('  Status:', response.status);
        console.log('  Stories found:', response.data?.data?.length || 0);
        
        if (response.data?.data?.length > 0) {
          console.log('\n📋 Story details:');
          response.data.data.forEach((story, index) => {
            console.log(`  ${index + 1}. Story ID: ${story.id}`);
            console.log(`     Media Type: ${story.media_type}`);
            console.log(`     Product Type: ${story.product_type || 'N/A'}`);
            console.log(`     Timestamp: ${story.timestamp}`);
            console.log('');
          });
        } else {
          console.log('  ℹ️ No stories found - account may not have active stories or may not be a business account');
        }
        
      } catch (apiError) {
        console.log('❌ Stories API Error:');
        console.log('  Status:', apiError.response?.status);
        console.log('  Error:', JSON.stringify(apiError.response?.data, null, 2));
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

testTokenDecryption().catch(console.error);