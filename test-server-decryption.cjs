const { MongoClient } = require('mongodb');

async function testTokenDecryption() {
  console.log('🔍 Testing token decryption directly from MongoDB...');
  
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
    console.log('  Has accessToken:', !!account.accessToken);
    console.log('  EncryptedAccessToken length:', account.encryptedAccessToken?.length || 0);
    console.log('  AccessToken length:', account.accessToken?.length || 0);
    
    // Now test the server's getSocialAccountsByWorkspace method
    console.log('\n🔍 Testing server getSocialAccountsByWorkspace...');
    
    // Import the storage class using require instead of import
    const { MongoDBStorage } = require('./server/mongodb-storage.js');
    const storage = new MongoDBStorage();
    
    const accounts = await storage.getSocialAccountsByWorkspace('686d91be22c4290df81af016');
    console.log('📊 Accounts returned:', accounts.length);
    
    const instagramAccount = accounts.find(acc => acc.platform === 'instagram');
    if (instagramAccount) {
      console.log('📱 Instagram account from storage:');
      console.log('  Username:', instagramAccount.username);
      console.log('  Has accessToken:', !!instagramAccount.accessToken);
      console.log('  AccessToken type:', typeof instagramAccount.accessToken);
      console.log('  AccessToken length:', instagramAccount.accessToken?.length || 0);
      console.log('  All keys:', Object.keys(instagramAccount));
    } else {
      console.log('❌ No Instagram account found from storage');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

testTokenDecryption();

async function testServerDecryption() {
  const mongoUri = 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
  const client = new MongoClient(mongoUri);
  
  try {
    await client.connect();
    const db = client.db('veeforedb');
    
    // Find the Instagram account
    const socialAccountsCollection = db.collection('socialaccounts');
    const instagramAccount = await socialAccountsCollection.findOne({ platform: 'instagram' });
    
    if (instagramAccount) {
      console.log(`✅ Found Instagram account: @${instagramAccount.username}`);
      console.log(`🆔 Account ID: ${instagramAccount.accountId}`);
      console.log(`🏢 Workspace ID: ${instagramAccount.workspaceId}`);
      console.log(`🔐 Has accessToken:`, !!instagramAccount.accessToken);
      console.log(`🔐 Has encryptedAccessToken:`, !!instagramAccount.encryptedAccessToken);
      console.log(`🔐 Has encryptedRefreshToken:`, !!instagramAccount.encryptedRefreshToken);
      
      if (instagramAccount.accessToken) {
        console.log(`🔐 Access token type:`, typeof instagramAccount.accessToken);
        console.log(`🔐 Access token length:`, instagramAccount.accessToken.length);
        console.log(`🔐 Access token preview:`, instagramAccount.accessToken.substring(0, 50) + '...');
      }
      
      if (instagramAccount.encryptedAccessToken) {
        console.log(`🔐 Encrypted access token type:`, typeof instagramAccount.encryptedAccessToken);
        console.log(`🔐 Encrypted access token:`, instagramAccount.encryptedAccessToken);
        
        // Test JSON parsing
        if (typeof instagramAccount.encryptedAccessToken === "string") {
          try {
            const parsed = JSON.parse(instagramAccount.encryptedAccessToken);
            console.log("✅ JSON parsing successful:", Object.keys(parsed));
            
            // Test if it has the old format
            if (parsed.encryptedData && !parsed.iv && !parsed.salt && !parsed.tag) {
              console.log("🔄 This is OLD FORMAT (base64 only)");
              try {
                const decoded = Buffer.from(parsed.encryptedData, 'base64').toString('utf8');
                console.log("✅ Base64 decoding successful, token length:", decoded.length);
                console.log("🔐 Decoded token preview:", decoded.substring(0, 50) + '...');
              } catch (err) {
                console.log("❌ Base64 decoding failed:", err.message);
              }
            } else if (parsed.iv && parsed.salt && parsed.tag && parsed.encryptedData) {
              console.log("🔄 This is NEW FORMAT (AES-256-GCM)");
            } else {
              console.log("❓ Unknown token format");
            }
            
          } catch (err) {
            console.log("❌ JSON parsing failed:", err.message);
          }
        }
      }
      
      // Check all fields
      console.log(`📄 All fields:`, Object.keys(instagramAccount));
      
    } else {
      console.log("❌ No Instagram account found");
    }
    
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await client.close();
  }
}

testServerDecryption();