const { MongoClient } = require('mongodb');
const crypto = require('crypto');

// Encryption settings from the app
const ENCRYPTION_KEY = '1907535313&9!2^3*5d8b0c+-=563bf_3467:6e74cfe2c@06$3bce5600bd4aba'; // From .env file
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const SALT_LENGTH = 32;
const TAG_LENGTH = 16;

class TokenEncryptionService {
  constructor() {
    this.masterKey = ENCRYPTION_KEY;
  }

  deriveKey(salt) {
    return crypto.pbkdf2Sync(this.masterKey, salt, 100000, KEY_LENGTH, 'sha256');
  }

  decryptToken(encryptedToken) {
    try {
      if (!encryptedToken || !encryptedToken.encryptedData) {
        throw new Error('Invalid encrypted token data');
      }

      const { encryptedData, iv, salt, tag } = encryptedToken;

      // Validate all required fields exist
      if (!encryptedData || !iv || !salt || !tag) {
        throw new Error('Missing encryption metadata fields');
      }

      // Convert base64 strings back to buffers
      const ivBuffer = Buffer.from(iv, 'base64');
      const saltBuffer = Buffer.from(salt, 'base64');
      const tagBuffer = Buffer.from(tag, 'base64');

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

      // Derive encryption key from master key + salt
      const key = this.deriveKey(saltBuffer);

      // Create decipher with proper AES-256-GCM using IV
      const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer);
      decipher.setAuthTag(tagBuffer);

      // Decrypt the token
      let decryptedData = decipher.update(encryptedData, 'base64', 'utf8');
      decryptedData += decipher.final('utf8');

      return decryptedData;
    } catch (error) {
      console.error('❌ Decryption error:', error.message);
      return null;
    }
  }
}

async function debugTokenDecryption() {
  console.log('🔍 Debugging token decryption flow...');
  
  const client = new MongoClient('mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0');
  const tokenService = new TokenEncryptionService();
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db('veeforedb');
    
    // Get the specific Instagram account
    const workspaceId = '686d91be22c4290df81af016';
    const socialAccount = await db.collection('socialaccounts').findOne({
      workspaceId: workspaceId,
      platform: 'instagram'
    });
    
    if (!socialAccount) {
      console.log('❌ No Instagram account found for workspace:', workspaceId);
      return;
    }
    
    console.log('\n📱 Instagram Account Details:');
    console.log(`   - Username: @${socialAccount.username}`);
    console.log(`   - Account ID: ${socialAccount._id}`);
    console.log(`   - Workspace ID: ${socialAccount.workspaceId}`);
    console.log(`   - Platform: ${socialAccount.platform}`);
    console.log(`   - Is Active: ${socialAccount.isActive}`);
    
    // Check token fields
    console.log('\n🔐 Token Analysis:');
    console.log(`   - Has accessToken: ${!!socialAccount.accessToken}`);
    console.log(`   - Has encryptedAccessToken: ${!!socialAccount.encryptedAccessToken}`);
    console.log(`   - Has refreshToken: ${!!socialAccount.refreshToken}`);
    console.log(`   - Has encryptedRefreshToken: ${!!socialAccount.encryptedRefreshToken}`);
    
    if (socialAccount.accessToken) {
      console.log(`   - accessToken length: ${socialAccount.accessToken.length}`);
      console.log(`   - accessToken preview: ${socialAccount.accessToken.substring(0, 20)}...`);
    }
    
    if (socialAccount.encryptedAccessToken) {
      console.log(`   - encryptedAccessToken type: ${typeof socialAccount.encryptedAccessToken}`);
      console.log(`   - encryptedAccessToken length: ${socialAccount.encryptedAccessToken.length}`);
      console.log(`   - encryptedAccessToken preview: ${socialAccount.encryptedAccessToken.substring(0, 100)}...`);
      
      // Try to parse as JSON first
      let encryptedTokenObj;
      try {
        encryptedTokenObj = JSON.parse(socialAccount.encryptedAccessToken);
        console.log(`   - Successfully parsed as JSON`);
        console.log(`   - JSON keys: ${Object.keys(encryptedTokenObj).join(', ')}`);
      } catch (parseError) {
        console.log(`   - Not valid JSON: ${parseError.message}`);
        return;
      }
      
      // Try to decrypt
      console.log('\n🔓 Attempting decryption...');
      const decryptedToken = tokenService.decryptToken(encryptedTokenObj);
      if (decryptedToken) {
        console.log(`   ✅ Decryption successful!`);
        console.log(`   - Decrypted token length: ${decryptedToken.length}`);
        console.log(`   - Decrypted token preview: ${decryptedToken.substring(0, 20)}...`);
      } else {
        console.log(`   ❌ Decryption failed`);
      }
    }
    
    // Simulate the getSocialAccountsByWorkspace logic
    console.log('\n🔄 Simulating getSocialAccountsByWorkspace logic...');
    
    const accounts = await db.collection('socialaccounts').find({
      workspaceId: workspaceId,
      isActive: true
    }).toArray();
    
    console.log(`   - Found ${accounts.length} active accounts for workspace`);
    
    for (const account of accounts) {
      console.log(`\n   📱 Processing account: @${account.username} (${account.platform})`);
      
      // Simulate the token handling logic
      let finalAccessToken = account.accessToken;
      let finalRefreshToken = account.refreshToken;
      
      console.log(`      - Initial accessToken: ${!!finalAccessToken}`);
      console.log(`      - Initial refreshToken: ${!!finalRefreshToken}`);
      
      // If no access token but has encrypted token, decrypt it
      if (!finalAccessToken && account.encryptedAccessToken) {
        console.log(`      - Attempting to decrypt encryptedAccessToken...`);
        try {
          const encryptedTokenObj = JSON.parse(account.encryptedAccessToken);
          finalAccessToken = tokenService.decryptToken(encryptedTokenObj);
          console.log(`      - Decryption result: ${!!finalAccessToken}`);
        } catch (error) {
          console.log(`      - Decryption failed: ${error.message}`);
        }
      }
      
      if (!finalRefreshToken && account.encryptedRefreshToken) {
        console.log(`      - Attempting to decrypt encryptedRefreshToken...`);
        try {
          const encryptedTokenObj = JSON.parse(account.encryptedRefreshToken);
          finalRefreshToken = tokenService.decryptToken(encryptedTokenObj);
          console.log(`      - Refresh token decryption result: ${!!finalRefreshToken}`);
        } catch (error) {
          console.log(`      - Refresh token decryption failed: ${error.message}`);
        }
      }
      
      console.log(`      - Final accessToken available: ${!!finalAccessToken}`);
      console.log(`      - Final refreshToken available: ${!!finalRefreshToken}`);
      
      if (account.platform === 'instagram') {
        console.log(`\n   🎯 Instagram account token status:`);
        console.log(`      - Would be returned with accessToken: ${!!finalAccessToken}`);
        console.log(`      - This is what immediate-sync would receive`);
        
        if (finalAccessToken) {
          console.log(`      - Token length: ${finalAccessToken.length}`);
          console.log(`      - Token preview: ${finalAccessToken.substring(0, 30)}...`);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

debugTokenDecryption().catch(console.error);