require('dotenv').config();
const { MongoClient } = require('mongodb');
const crypto = require('crypto');
const axios = require('axios');

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

      console.log('  Buffer lengths - IV:', ivBuffer.length, 'Salt:', saltBuffer.length, 'Tag:', tagBuffer.length);

      // Derive key
      const key = this.deriveKey(saltBuffer);
      console.log('  Key derived successfully');

      // Create decipher
      const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer);
      decipher.setAuthTag(tagBuffer);

      console.log('  Decipher created');

      // Decrypt
      let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
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

// Mock MongoStorage class with fixed decryptStoredToken method
class MockMongoStorage {
  constructor() {
    this.tokenEncryption = new TokenEncryptionService();
  }

  decryptStoredToken(encryptedToken) {
    if (!encryptedToken) {
      return null;
    }
    try {
      // Handle both string (JSON) and object formats
      let tokenData;
      if (typeof encryptedToken === 'string') {
        try {
          // Parse JSON string from database
          tokenData = JSON.parse(encryptedToken);
        }
        catch (parseError) {
          console.warn('🚨 P2-FIX: Failed to parse JSON token data, invalid format');
          return null;
        }
      }
      else if (typeof encryptedToken === 'object') {
        // Already an object
        tokenData = encryptedToken;
      }
      else {
        console.warn('🚨 P2-FIX: Invalid encrypted token format, expected string or object');
        return null;
      }
      
      // Validate required fields exist
      if (!tokenData.encryptedData || !tokenData.iv || !tokenData.salt || !tokenData.tag) {
        console.warn('🚨 P2-FIX: Incomplete encrypted token data, missing required fields:', {
          hasEncryptedData: !!tokenData.encryptedData,
          hasIV: !!tokenData.iv,
          hasSalt: !!tokenData.salt,
          hasTag: !!tokenData.tag
        });
        return null;
      }

      // CRITICAL FIX: TokenEncryptionService expects base64 encoded components
      // The stored tokens are already in base64 format, so pass them directly
      const tokenForDecryption = {
        encryptedData: tokenData.encryptedData, // Already base64
        iv: tokenData.iv,                       // Already base64
        salt: tokenData.salt,                   // Already base64
        tag: tokenData.tag                      // Already base64
      };

      console.log('🔓 Decrypting token with base64 components:', {
        hasEncryptedData: !!tokenForDecryption.encryptedData,
        hasIV: !!tokenForDecryption.iv,
        hasSalt: !!tokenForDecryption.salt,
        hasTag: !!tokenForDecryption.tag
      });

      // Attempt decryption with detailed error handling
      const decryptedToken = this.tokenEncryption.decryptToken(tokenForDecryption);
      if (!decryptedToken || decryptedToken.trim().length === 0) {
        console.warn('🚨 P2-FIX: Decryption returned empty token');
        return null;
      }
      
      console.log('✅ Token decryption successful, length:', decryptedToken.length);
      return decryptedToken;
    }
    catch (error) {
      // Enhanced error logging for debugging
      console.warn('🚨 P2-FIX: Token decryption failed:', {
        error: error.message,
        tokenType: typeof encryptedToken,
        tokenLength: typeof encryptedToken === 'string' ? encryptedToken.length : 'N/A',
        hasBasicStructure: !!(encryptedToken && typeof encryptedToken === 'object')
      });
      return null;
    }
  }

  async getAccessTokenFromAccount(account) {
    console.log(`[TOKEN DEBUG] Validating encrypted token for ${account.username}:`, {
      hasExpiresAt: !!account.expiresAt,
      expiresAt: account.expiresAt,
      hasEncryptedToken: !!account.encryptedAccessToken,
      hasLegacyToken: !!account.accessToken,
      encryptedType: typeof account.encryptedAccessToken,
      legacyType: typeof account.accessToken,
      encryptedValue: account.encryptedAccessToken ? 'EXISTS' : 'NULL',
      legacyValue: account.accessToken ? 'EXISTS' : 'NULL',
      rawAccountKeys: Object.keys(account).filter(k => k.includes('Token') || k.includes('token'))
    });

    // Check if token has expired first
    if (account.expiresAt && new Date() >= new Date(account.expiresAt)) {
      console.log(`[TOKEN VALIDATION] Account ${account.username} token expired at ${account.expiresAt}`);
      return null;
    }

    // Decrypt the encrypted token (if present)
    const decryptedToken = account.encryptedAccessToken
      ? this.decryptStoredToken(account.encryptedAccessToken)
      : null;
    
    if (!decryptedToken || decryptedToken.trim() === '') {
      console.warn(`🚨 SECURITY: Failed to decrypt access token for account ${account.username}`);
      return null;
    }
    
    console.log(`[TOKEN DEBUG] Successfully decrypted encrypted token for ${account.username} (length: ${decryptedToken.length})`);
    return decryptedToken;
  }
}

// Mock InstagramApiService getUserStories method
class MockInstagramApiService {
  static async getUserStories(token) {
    const fields = 'id,media_type,media_url,thumbnail_url,permalink,timestamp,username';
    const url = `https://graph.instagram.com/me/stories?fields=${fields}&access_token=${token}`;
    
    console.log('📡 Making Instagram Stories API request...');
    console.log('🔗 URL:', url.replace(token, '[TOKEN_REDACTED]'));
    
    try {
      const response = await axios.get(url);
      console.log('✅ Instagram Stories API Response Status:', response.status);
      console.log('📊 Stories data:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Instagram Stories API Error:', error.response?.status, error.response?.data || error.message);
      throw error;
    }
  }
}

async function testGetUserStoriesWithFixedDecryption() {
  console.log('🧪 Testing getUserStories with fixed token decryption...');
  
  const client = new MongoClient('mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0');
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db('veeforedb');
    const socialAccountsCollection = db.collection('socialaccounts');
    
    // Find the arpit.10 Instagram account
    const account = await socialAccountsCollection.findOne({
      platform: 'instagram',
      username: 'arpit.10'
    });
    
    if (!account) {
      console.log('❌ Instagram account arpit.10 not found');
      return;
    }
    
    console.log('✅ Found Instagram account:', account.username);
    console.log('📊 Account details:', {
      id: account._id,
      username: account.username,
      platform: account.platform,
      hasEncryptedToken: !!account.encryptedAccessToken,
      hasLegacyToken: !!account.accessToken,
      expiresAt: account.expiresAt
    });
    
    // Test the fixed token decryption
    const mockStorage = new MockMongoStorage();
    const decryptedToken = await mockStorage.getAccessTokenFromAccount(account);
    
    if (!decryptedToken) {
      console.log('❌ Failed to decrypt token');
      return;
    }
    
    console.log('✅ Token decrypted successfully');
    console.log('🔐 Token length:', decryptedToken.length);
    console.log('🔐 Token preview:', decryptedToken.substring(0, 50) + '...');
    
    // Test getUserStories with the decrypted token
    console.log('\n📱 Testing getUserStories API call...');
    const storiesData = await MockInstagramApiService.getUserStories(decryptedToken);
    
    console.log('\n🎉 getUserStories test completed successfully!');
    console.log('📊 Stories response:', {
      hasData: !!storiesData.data,
      storiesCount: storiesData.data ? storiesData.data.length : 0,
      paging: storiesData.paging
    });
    
    if (storiesData.data && storiesData.data.length > 0) {
      console.log('📸 Found stories:', storiesData.data.map(story => ({
        id: story.id,
        media_type: story.media_type,
        timestamp: story.timestamp
      })));
    } else {
      console.log('📭 No active stories found (this is normal - stories expire after 24 hours)');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await client.close();
    console.log('🔌 MongoDB connection closed');
  }
}

testGetUserStoriesWithFixedDecryption();