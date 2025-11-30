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
    this.masterKey = process.env.TOKEN_ENCRYPTION_KEY || '1907535313&9!2^3*5d8b0c+-=563bf_3467:6e74cfe2c@06$3bce5600bd4aba';
    console.log('🔑 Using master key:', this.masterKey.substring(0, 10) + '...');
  }

  deriveKey(salt) {
    return crypto.pbkdf2Sync(this.masterKey, salt, 100000, KEY_LENGTH, 'sha256');
  }

  decryptToken(encryptedToken) {
    try {
      console.log('🔍 Decrypting token with data:', {
        hasEncryptedData: !!encryptedToken.encryptedData,
        hasIV: !!encryptedToken.iv,
        hasSalt: !!encryptedToken.salt,
        hasTag: !!encryptedToken.tag
      });

      if (!encryptedToken || !encryptedToken.encryptedData) {
        throw new Error('Invalid encrypted token data');
      }

      // BACKWARD COMPATIBILITY: Handle old format tokens
      if (encryptedToken.encryptedData && !encryptedToken.iv && !encryptedToken.salt && !encryptedToken.tag) {
        console.log('🔄 Using backward compatibility for old token format');
        try {
          return Buffer.from(encryptedToken.encryptedData, 'base64').toString('utf8');
        } catch (error) {
          throw new Error('Failed to decode legacy base64 token');
        }
      }

      const { encryptedData, iv, salt, tag } = encryptedToken;

      // Validate all required fields exist
      if (!encryptedData || !iv || !salt || !tag) {
        throw new Error('Missing encryption metadata fields');
      }

      // Convert base64 strings back to buffers with validation
      let ivBuffer, saltBuffer, tagBuffer;
      
      try {
        ivBuffer = Buffer.from(iv, 'base64');
        saltBuffer = Buffer.from(salt, 'base64');
        tagBuffer = Buffer.from(tag, 'base64');
      } catch (parseError) {
        throw new Error('Invalid base64 encoding in token metadata');
      }

      // Validate buffer lengths
      if (ivBuffer.length !== IV_LENGTH) {
        throw new Error(`Invalid IV length: expected ${IV_LENGTH}, got ${ivBuffer.length}`);
      }
      if (saltBuffer.length !== SALT_LENGTH) {
        throw new Error(`Invalid salt length: expected ${SALT_LENGTH}, got ${saltBuffer.length}`);
      }
      if (tagBuffer.length !== TAG_LENGTH) {
        throw new Error(`Invalid tag length: expected ${TAG_LENGTH}, got ${tagBuffer.length}`);
      }

      // Derive the same encryption key
      const key = this.deriveKey(saltBuffer);

      // Create decipher with proper AES-256-GCM
      const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer);
      decipher.setAuthTag(tagBuffer);

      // Decrypt the token
      let decryptedData;
      try {
        decryptedData = decipher.update(encryptedData, 'base64', 'utf8');
        decryptedData += decipher.final('utf8');
      } catch (cryptoError) {
        // Handle specific GCM authentication failures
        if (cryptoError.message.includes('Unsupported state') ||
            cryptoError.message.includes('unable to authenticate')) {
          throw new Error('Token authentication failed - data may be corrupted or key mismatch');
        }
        throw cryptoError;
      }

      console.log('✅ Token decrypted successfully, length:', decryptedData.length);
      return decryptedData;
    } catch (error) {
      console.error('❌ Token decryption failed:', error.message);
      throw error;
    }
  }
}

async function testTokenDecryption() {
  console.log('🔍 Testing token decryption with actual encryption service...');
  
  const client = new MongoClient('mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0');
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db('veeforedb');
    const collection = db.collection('socialaccounts');
    
    // Find Instagram account
    const account = await collection.findOne({
      workspaceId: '686d91be22c4290df81af016',
      platform: 'instagram'
    });
    
    if (!account) {
      console.log('❌ No Instagram account found');
      return;
    }
    
    console.log('📱 Instagram account found:');
    console.log('  Username:', account.username);
    console.log('  Has encryptedAccessToken:', !!account.encryptedAccessToken);
    console.log('  EncryptedAccessToken type:', typeof account.encryptedAccessToken);
    console.log('  EncryptedAccessToken length:', account.encryptedAccessToken?.length || 0);
    
    if (account.encryptedAccessToken) {
      console.log('\n🔍 Testing token decryption...');
      
      const tokenService = new TokenEncryptionService();
      
      try {
        // Parse the encrypted token
        let tokenData;
        if (typeof account.encryptedAccessToken === 'string') {
          tokenData = JSON.parse(account.encryptedAccessToken);
        } else {
          tokenData = account.encryptedAccessToken;
        }
        
        console.log('📊 Token structure:', {
          hasEncryptedData: !!tokenData.encryptedData,
          hasIV: !!tokenData.iv,
          hasSalt: !!tokenData.salt,
          hasTag: !!tokenData.tag,
          encryptedDataLength: tokenData.encryptedData?.length || 0
        });
        
        // Attempt decryption
        const decryptedToken = tokenService.decryptToken(tokenData);
        
        if (decryptedToken) {
          console.log('✅ Token decryption successful!');
          console.log('🔐 Decrypted token length:', decryptedToken.length);
          console.log('🔐 Token preview:', decryptedToken.substring(0, 50) + '...');
        } else {
          console.log('❌ Token decryption returned null');
        }
        
      } catch (error) {
        console.error('❌ Token decryption failed:', error.message);
        console.error('❌ Full error:', error);
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

testTokenDecryption();