const { MongoClient } = require('mongodb');
const crypto = require('crypto');

// Since token-encryption.js uses ES modules, we'll implement a simple decryption function
function decryptToken(encryptedData) {
    try {
        const parsed = JSON.parse(encryptedData);
        
        // Handle both old and new formats
        let iv, salt, tag, data;
        
        if (parsed.encryptedData) {
            // Old format - just base64 encoded data, no proper encryption
            console.log('  - Using old format decryption (base64 only)');
            return Buffer.from(parsed.encryptedData, 'base64').toString('utf8');
        } else if (parsed.iv && parsed.salt && parsed.tag && parsed.data) {
            // New format with proper AES-256-GCM encryption
            console.log('  - Using new format decryption (AES-256-GCM)');
            iv = parsed.iv;
            salt = parsed.salt;
            tag = parsed.tag;
            data = parsed.data;
        } else {
            console.log('  - Unknown encryption format:', Object.keys(parsed));
            return null;
        }
        
        // Get encryption key from environment
        const encryptionKey = process.env.TOKEN_ENCRYPTION_KEY || 'default-key-for-development-only-not-secure';
        
        // Derive key using PBKDF2
        const key = crypto.pbkdf2Sync(encryptionKey, Buffer.from(salt, 'base64'), 100000, 32, 'sha256');
        
        // Create decipher
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
        decipher.setAuthTag(Buffer.from(tag, 'base64'));
        
        // Decrypt
        let decrypted = decipher.update(Buffer.from(data, 'base64'), null, 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    } catch (error) {
        console.error('Decryption failed:', error.message);
        return null;
    }
}

async function debugImmediateSync() {
  console.log('🔍 DEBUG: Testing immediate sync API and account data...\n');

  // Connect to MongoDB
  const mongoUri = 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
  const client = new MongoClient(mongoUri);
  
  try {
    await client.connect();
    const db = client.db('veeforedb');
    const socialAccountsCollection = db.collection('socialaccounts');

    console.log('📊 STEP 1: Check Instagram accounts in database');
    console.log('='.repeat(50));
    
    const workspaceId = '686d91be22c4290df81af016';
    const accounts = await socialAccountsCollection.find({
      workspaceId: workspaceId,
      platform: 'instagram'
    }).toArray();

    console.log(`Found ${accounts.length} Instagram accounts for workspace ${workspaceId}`);
    
    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];
      console.log(`\n📱 Account ${i + 1}: @${account.username}`);
      console.log(`  - ID: ${account._id}`);
      console.log(`  - Account ID: ${account.accountId}`);
      console.log(`  - Platform: ${account.platform}`);
      console.log(`  - Active: ${account.isActive}`);
      console.log(`  - Workspace ID: ${account.workspaceId}`);
      console.log(`  - Has accessToken: ${!!account.accessToken}`);
        console.log(`  - Has encryptedAccessToken: ${!!account.encryptedAccessToken}`);
        console.log(`  - EncryptedAccessToken type: ${typeof account.encryptedAccessToken}`);
        console.log(`  - EncryptedAccessToken value: ${account.encryptedAccessToken ? account.encryptedAccessToken.substring(0, 100) + '...' : 'null'}`);
        console.log(`  - Needs Reconnection: ${account.needsReconnection}`);
      
      // Try to decrypt the token
      if (account.encryptedAccessToken && !account.accessToken) {
        const decryptedToken = decryptToken(account.encryptedAccessToken);
        if (decryptedToken) {
          console.log(`  - ✅ Token decryption: SUCCESS (${decryptedToken.length} chars)`);
          console.log(`  - Token preview: ${decryptedToken.substring(0, 20)}...`);
        } else {
          console.log(`  - ❌ Token decryption: FAILED`);
        }
      }
    }

    console.log('\n📡 STEP 2: Test immediate sync API call');
    console.log('='.repeat(50));
    
    try {
      const response = await fetch('http://localhost:5000/api/instagram/immediate-sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          workspaceId: workspaceId
        })
      });

      const responseText = await response.text();
      console.log(`API Response Status: ${response.status}`);
      console.log(`API Response Body: ${responseText}`);
      
      if (!response.ok) {
        console.log('❌ API call failed');
      } else {
        console.log('✅ API call succeeded');
      }
    } catch (error) {
      console.log(`❌ API call error: ${error.message}`);
    }

    console.log('\n🔧 STEP 3: Check storage method behavior');
    console.log('='.repeat(50));
    
    // Simulate what getSocialAccountsByWorkspace does
    const storageAccounts = await socialAccountsCollection.find({
      workspaceId: workspaceId
    }).toArray();
    
    console.log(`Storage method would find ${storageAccounts.length} accounts`);
    
    for (const account of storageAccounts) {
      console.log(`\n📱 Storage Account: @${account.username}`);
      console.log(`  - Platform: ${account.platform}`);
      console.log(`  - Active: ${account.isActive}`);
      console.log(`  - Raw accessToken field: ${!!account.accessToken}`);
      console.log(`  - Raw encryptedAccessToken field: ${!!account.encryptedAccessToken}`);
      
      // Simulate token decryption like the storage method should do
      if (account.encryptedAccessToken && !account.accessToken) {
        account.accessToken = decryptToken(account.encryptedAccessToken);
        if (account.accessToken) {
          console.log(`  - ✅ After decryption: accessToken exists (${account.accessToken.length} chars)`);
        } else {
          console.log(`  - ❌ Decryption failed`);
        }
      }
      
      // Check if this would be selected by the immediate sync logic
      const wouldBeSelected = account.platform === 'instagram' && account.isActive;
      console.log(`  - Would be selected by immediate sync: ${wouldBeSelected}`);
      console.log(`  - Has accessToken after processing: ${!!account.accessToken}`);
    }

  } catch (error) {
    console.error('❌ Debug script error:', error);
  } finally {
    await client.close();
  }
}

debugImmediateSync().catch(console.error);