require('dotenv').config();
const { MongoClient } = require('mongodb');

async function debugTokenFormat() {
  console.log('🔍 Debugging token format and encoding...');
  
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
    
    const encryptedToken = account.encryptedAccessToken;
    console.log('\n🔍 Encrypted Token Analysis:');
    console.log('  Type:', typeof encryptedToken);
    console.log('  Keys:', Object.keys(encryptedToken));
    
    // Analyze each component
    console.log('\n📋 Component Analysis:');
    
    Object.keys(encryptedToken).forEach(key => {
      const value = encryptedToken[key];
      console.log(`\n${key}:`);
      console.log(`  Type: ${typeof value}`);
      console.log(`  Length: ${value?.length || 'N/A'}`);
      console.log(`  Value: ${value}`);
      
      // Try different decoding methods
      if (typeof value === 'string') {
        console.log(`  Decoding attempts:`);
        
        // Try hex decoding
        try {
          const hexBuffer = Buffer.from(value, 'hex');
          console.log(`    Hex decode length: ${hexBuffer.length}`);
          console.log(`    Hex decode valid: ${hexBuffer.length > 0}`);
        } catch (e) {
          console.log(`    Hex decode failed: ${e.message}`);
        }
        
        // Try base64 decoding
        try {
          const base64Buffer = Buffer.from(value, 'base64');
          console.log(`    Base64 decode length: ${base64Buffer.length}`);
          console.log(`    Base64 decode valid: ${base64Buffer.length > 0}`);
        } catch (e) {
          console.log(`    Base64 decode failed: ${e.message}`);
        }
        
        // Check if it looks like base64
        const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
        console.log(`    Looks like base64: ${base64Regex.test(value)}`);
        
        // Check if it looks like hex
        const hexRegex = /^[0-9a-fA-F]+$/;
        console.log(`    Looks like hex: ${hexRegex.test(value)}`);
      }
    });
    
    // Test with base64 decoding instead of hex
    console.log('\n🔧 Testing base64 decoding:');
    try {
      const { encryptedData, iv, salt, tag } = encryptedToken;
      
      const ivBuffer = Buffer.from(iv, 'base64');
      const saltBuffer = Buffer.from(salt, 'base64');
      const tagBuffer = Buffer.from(tag, 'base64');
      
      console.log('  Base64 buffer lengths:');
      console.log(`    IV: ${ivBuffer.length} bytes`);
      console.log(`    Salt: ${saltBuffer.length} bytes`);
      console.log(`    Tag: ${tagBuffer.length} bytes`);
      
      // Check if these match expected lengths
      console.log('  Expected vs Actual:');
      console.log(`    IV: expected 12, got ${ivBuffer.length} ${ivBuffer.length === 12 ? '✅' : '❌'}`);
      console.log(`    Salt: expected 32, got ${saltBuffer.length} ${saltBuffer.length === 32 ? '✅' : '❌'}`);
      console.log(`    Tag: expected 16, got ${tagBuffer.length} ${tagBuffer.length === 16 ? '✅' : '❌'}`);
      
    } catch (error) {
      console.log('  Base64 decoding failed:', error.message);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

debugTokenFormat().catch(console.error);