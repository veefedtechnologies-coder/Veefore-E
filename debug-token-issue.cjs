const mongoose = require('mongoose');
require('dotenv').config();

// MongoDB connection
const mongoUri = process.env.MONGODB_URI || process.env.DATABASE_URL;

if (!mongoUri) {
    console.error('❌ No MongoDB URI found in environment variables');
    process.exit(1);
}

// Define schema
const socialAccountSchema = new mongoose.Schema({}, { strict: false, collection: 'socialaccounts' });
const SocialAccount = mongoose.model('SocialAccount', socialAccountSchema);

// Import token encryption service
const crypto = require('crypto');

class TokenEncryptionService {
    constructor() {
        this.masterKey = process.env.TOKEN_ENCRYPTION_KEY || 'development-key-not-secure';
    }

    deriveKey(salt) {
        return crypto.pbkdf2Sync(this.masterKey, salt, 100000, 32, 'sha256');
    }

    decryptToken(encryptedToken) {
        try {
            console.log('🔍 Attempting to decrypt token...');
            console.log('Token type:', typeof encryptedToken);
            console.log('Token structure:', encryptedToken);

            // Handle different token formats
            let tokenData;
            if (typeof encryptedToken === 'string') {
                // Check if it's a simple string (not encrypted)
                if (!encryptedToken.includes(':') && !encryptedToken.includes('{')) {
                    console.log('⚠️  Token appears to be plain text, not encrypted');
                    return encryptedToken;
                }
                
                // Try to parse as JSON
                try {
                    tokenData = JSON.parse(encryptedToken);
                } catch (e) {
                    console.log('❌ Token is not valid JSON');
                    return encryptedToken; // Return as-is if not JSON
                }
            } else if (typeof encryptedToken === 'object') {
                tokenData = encryptedToken;
            } else {
                throw new Error('Invalid token format');
            }

            const { encryptedData, iv, salt, tag } = tokenData;

            if (!encryptedData || !iv || !salt || !tag) {
                console.log('❌ Missing encryption metadata fields');
                return null;
            }

            // Convert base64 strings back to buffers
            const ivBuffer = Buffer.from(iv, 'base64');
            const saltBuffer = Buffer.from(salt, 'base64');
            const tagBuffer = Buffer.from(tag, 'base64');
            
            // Derive the same encryption key
            const key = this.deriveKey(saltBuffer);
            
            // Create decipher
            const decipher = crypto.createDecipheriv('aes-256-gcm', key, ivBuffer);
            decipher.setAuthTag(tagBuffer);
            
            // Decrypt the token
            let decryptedData = decipher.update(encryptedData, 'base64', 'utf8');
            decryptedData += decipher.final('utf8');
            
            console.log('✅ Token decrypted successfully');
            return decryptedData;
        } catch (error) {
            console.error('❌ Token decryption failed:', error.message);
            return null;
        }
    }
}

async function debugTokenIssue() {
    try {
        console.log('🔍 Connecting to MongoDB...');
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB successfully');

        // Get Instagram account
        const instagramAccount = await SocialAccount.findOne({ platform: 'instagram' });
        
        if (!instagramAccount) {
            console.log('❌ No Instagram account found');
            return;
        }

        console.log(`\n👤 Account: @${instagramAccount.username}`);
        console.log(`   ID: ${instagramAccount._id}`);
        
        // Examine token fields
        console.log('\n🔐 Token Analysis:');
        console.log(`   Has accessToken: ${!!instagramAccount.accessToken}`);
        console.log(`   Has encryptedAccessToken: ${!!instagramAccount.encryptedAccessToken}`);
        
        if (instagramAccount.accessToken) {
            console.log(`   AccessToken type: ${typeof instagramAccount.accessToken}`);
            console.log(`   AccessToken length: ${instagramAccount.accessToken.length}`);
            console.log(`   AccessToken preview: ${instagramAccount.accessToken.substring(0, 30)}...`);
        }
        
        if (instagramAccount.encryptedAccessToken) {
            console.log(`   EncryptedAccessToken type: ${typeof instagramAccount.encryptedAccessToken}`);
            console.log(`   EncryptedAccessToken length: ${JSON.stringify(instagramAccount.encryptedAccessToken).length}`);
            console.log(`   EncryptedAccessToken structure:`, instagramAccount.encryptedAccessToken);
        }

        // Test token decryption
        console.log('\n🧪 Testing Token Decryption:');
        const tokenService = new TokenEncryptionService();
        
        let decryptedToken = null;
        
        if (instagramAccount.encryptedAccessToken) {
            console.log('Attempting to decrypt encryptedAccessToken...');
            decryptedToken = tokenService.decryptToken(instagramAccount.encryptedAccessToken);
        } else if (instagramAccount.accessToken) {
            console.log('Attempting to decrypt accessToken...');
            decryptedToken = tokenService.decryptToken(instagramAccount.accessToken);
        }
        
        if (decryptedToken) {
            console.log('✅ Token decryption successful!');
            console.log(`   Decrypted token length: ${decryptedToken.length}`);
            console.log(`   Decrypted token preview: ${decryptedToken.substring(0, 30)}...`);
            
            // Test the token with Instagram API
            console.log('\n📡 Testing token with Instagram API...');
            try {
                const fetch = (await import('node-fetch')).default;
                const response = await fetch(`https://graph.instagram.com/me?fields=id,username,account_type&access_token=${decryptedToken}`);
                const data = await response.json();
                
                if (response.ok) {
                    console.log('✅ Instagram API test successful!');
                    console.log('   Account info:', JSON.stringify(data, null, 2));
                } else {
                    console.log('❌ Instagram API test failed:');
                    console.log('   Error:', JSON.stringify(data, null, 2));
                }
            } catch (apiError) {
                console.error('❌ Instagram API test error:', apiError.message);
            }
        } else {
            console.log('❌ Token decryption failed');
        }

        // Check if the issue is with the token format
        console.log('\n🔍 Diagnosing Token Format Issues:');
        
        if (instagramAccount.accessToken === 'test_access_token') {
            console.log('🚨 FOUND THE ISSUE: Token is set to "test_access_token"');
            console.log('   This is a placeholder token, not a real Instagram access token');
            console.log('   The account needs to be properly connected via OAuth');
        }

        console.log('\n✅ Diagnosis complete!');

    } catch (error) {
        console.error('❌ Error during diagnosis:', error);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected from MongoDB');
    }
}

debugTokenIssue();