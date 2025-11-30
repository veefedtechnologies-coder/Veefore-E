const { MongoClient } = require('mongodb');
require('dotenv').config();

async function investigateKeyMismatch() {
    console.log('🔍 Investigating TOKEN_ENCRYPTION_KEY mismatch...\n');
    
    // Check current environment
    console.log('📋 Current Environment:');
    console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
    console.log(`Has TOKEN_ENCRYPTION_KEY: ${!!process.env.TOKEN_ENCRYPTION_KEY}`);
    console.log(`TOKEN_ENCRYPTION_KEY length: ${process.env.TOKEN_ENCRYPTION_KEY?.length || 0}`);
    console.log(`TOKEN_ENCRYPTION_KEY (first 16 chars): ${process.env.TOKEN_ENCRYPTION_KEY?.substring(0, 16) || 'N/A'}...`);
    console.log('');
    
    const client = new MongoClient(process.env.MONGODB_URI);
    
    try {
        await client.connect();
        console.log('✅ Connected to MongoDB');
        
        const db = client.db('veeforedb');
        const collection = db.collection('socialaccounts');
        
        // Find all Instagram accounts with encrypted tokens
        const accounts = await collection.find({
            platform: 'instagram',
            encryptedAccessToken: { $exists: true, $ne: null }
        }).toArray();
        
        console.log(`\n📊 Found ${accounts.length} Instagram accounts with encrypted tokens:`);
        
        for (const account of accounts) {
            console.log(`\n👤 Account: ${account.username}`);
            console.log(`   Created: ${account.createdAt || 'Unknown'}`);
            console.log(`   Updated: ${account.updatedAt || 'Unknown'}`);
            console.log(`   Has encryptedAccessToken: ${!!account.encryptedAccessToken}`);
            console.log(`   Has accessToken: ${!!account.accessToken}`);
            
            if (account.encryptedAccessToken && typeof account.encryptedAccessToken === 'object') {
                const encrypted = account.encryptedAccessToken;
                console.log(`   Encryption structure:`);
                console.log(`     - encryptedData length: ${encrypted.encryptedData?.length || 0}`);
                console.log(`     - iv length: ${encrypted.iv?.length || 0}`);
                console.log(`     - salt length: ${encrypted.salt?.length || 0}`);
                console.log(`     - tag length: ${encrypted.tag?.length || 0}`);
                
                // Check if this looks like the current encryption format
                const hasAllFields = encrypted.encryptedData && encrypted.iv && encrypted.salt && encrypted.tag;
                console.log(`     - Valid AES-256-GCM format: ${hasAllFields ? '✅' : '❌'}`);
            }
        }
        
        // Check if there are any accounts with plain text tokens (legacy)
        const legacyAccounts = await collection.find({
            platform: 'instagram',
            accessToken: { $exists: true, $ne: null, $type: 'string' }
        }).toArray();
        
        console.log(`\n📊 Found ${legacyAccounts.length} Instagram accounts with legacy plain text tokens`);
        
        if (legacyAccounts.length > 0) {
            console.log('\n💡 ANALYSIS:');
            console.log('   - You have both encrypted and legacy accounts');
            console.log('   - This suggests a migration happened at some point');
            console.log('   - The encrypted tokens might have been created with a different key');
        } else {
            console.log('\n💡 ANALYSIS:');
            console.log('   - All tokens are encrypted (no legacy plain text tokens found)');
            console.log('   - The current TOKEN_ENCRYPTION_KEY might not match the original encryption key');
            console.log('   - Possible solutions:');
            console.log('     1. Find the original encryption key that was used');
            console.log('     2. Re-authenticate all Instagram accounts to get fresh tokens');
            console.log('     3. Check if there\'s a backup of the original .env file');
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await client.close();
    }
}

investigateKeyMismatch().catch(console.error);