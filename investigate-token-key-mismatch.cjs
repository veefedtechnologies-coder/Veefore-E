require('dotenv').config();
const { MongoClient } = require('mongodb');
const crypto = require('crypto');

// Encryption configuration
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;

class TokenDecryptionTester {
  constructor(masterKey) {
    this.masterKey = masterKey;
  }

  deriveKey(salt) {
    return crypto.pbkdf2Sync(this.masterKey, salt, 100000, KEY_LENGTH, 'sha256');
  }

  testDecryption(encryptedToken) {
    try {
      const { encryptedData, iv, salt, tag } = encryptedToken;

      if (!encryptedData || !iv || !salt || !tag) {
        return { success: false, error: 'Missing encryption metadata' };
      }

      // Convert base64 strings back to buffers
      const ivBuffer = Buffer.from(iv, 'base64');
      const saltBuffer = Buffer.from(salt, 'base64');
      const tagBuffer = Buffer.from(tag, 'base64');

      // Derive encryption key from master key + salt
      const key = this.deriveKey(saltBuffer);

      // Create decipher
      const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer);
      decipher.setAuthTag(tagBuffer);

      // Decrypt the token
      let decryptedData = decipher.update(encryptedData, 'base64', 'utf8');
      decryptedData += decipher.final('utf8');

      return { success: true, token: decryptedData };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

async function investigateKeyMismatch() {
  console.log('🔍 Investigating Token Key Mismatch...\n');
  
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
    
    if (!account || !account.encryptedAccessToken) {
      console.log('❌ No encrypted token found');
      return;
    }
    
    console.log('📱 Found encrypted token for arpit.10');
    console.log('Token structure:', {
      hasEncryptedData: !!account.encryptedAccessToken.encryptedData,
      hasIV: !!account.encryptedAccessToken.iv,
      hasSalt: !!account.encryptedAccessToken.salt,
      hasTag: !!account.encryptedAccessToken.tag
    });
    
    // Test different possible keys
    const possibleKeys = [
      process.env.TOKEN_ENCRYPTION_KEY, // Current key from .env
      '1907535313&9!2^3*5d8b0c+-=563bf_3467:6e74cfe2c@06$3bce5600bd4aba', // Hardcoded key from scripts
      'development-key-not-secure', // Development key
      'your-32-character-master-key-here', // Default key
      'default-key-for-development-only-not-secure', // Another default
    ];
    
    console.log('\n🔑 Testing different encryption keys...');
    
    for (let i = 0; i < possibleKeys.length; i++) {
      const key = possibleKeys[i];
      if (!key) continue;
      
      console.log(`\n${i + 1}. Testing key: ${key.substring(0, 20)}...`);
      
      const tester = new TokenDecryptionTester(key);
      const result = tester.testDecryption(account.encryptedAccessToken);
      
      if (result.success) {
        console.log('✅ SUCCESS! Token decrypted with this key');
        console.log('Decrypted token length:', result.token.length);
        console.log('Token preview:', result.token.substring(0, 30) + '...');
        
        // Test with Instagram API
        console.log('\n📡 Testing with Instagram API...');
        const fetch = require('node-fetch');
        try {
          const response = await fetch(`https://graph.instagram.com/me?fields=id,username&access_token=${result.token}`);
          const data = await response.json();
          
          if (response.ok) {
            console.log('✅ Instagram API test successful!');
            console.log('Account info:', data);
            console.log('\n🎯 SOLUTION FOUND!');
            console.log(`The correct encryption key is: ${key}`);
            break;
          } else {
            console.log('❌ Instagram API failed:', data.error?.message || 'Unknown error');
          }
        } catch (apiError) {
          console.log('❌ Instagram API request failed:', apiError.message);
        }
      } else {
        console.log('❌ Failed:', result.error);
      }
    }
    
  } catch (error) {
    console.error('❌ Investigation failed:', error);
  } finally {
    await client.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

investigateKeyMismatch().catch(console.error);