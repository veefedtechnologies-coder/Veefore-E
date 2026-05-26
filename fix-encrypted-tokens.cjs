const mongoose = require('mongoose');
const crypto = require('crypto');

// MongoDB connection string from .env
const mongoUri = 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

// Token encryption configuration (matching the service)
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const SALT_LENGTH = 32;
const TAG_LENGTH = 16;

class TokenEncryptionService {
    constructor() {
        this.masterKey = process.env.TOKEN_ENCRYPTION_KEY || '1907535313&9!2^3*5d8b0c+-=563bf_3467:6e74cfe2c@06$3bce5600bd4aba';
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

            if (!encryptedData || !iv || !salt || !tag) {
                throw new Error('Missing encryption metadata fields');
            }

            const ivBuffer = Buffer.from(iv, 'base64');
            const saltBuffer = Buffer.from(salt, 'base64');
            const tagBuffer = Buffer.from(tag, 'base64');

            const key = this.deriveKey(saltBuffer);
            const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer);
            decipher.setAuthTag(tagBuffer);

            let decryptedData = decipher.update(encryptedData, 'base64', 'utf8');
            decryptedData += decipher.final('utf8');

            return decryptedData;
        } catch (error) {
            throw new Error(`Token decryption failed: ${error.message}`);
        }
    }

    encryptToken(token) {
        try {
            if (!token || typeof token !== 'string') {
                throw new Error('Invalid token: must be a non-empty string');
            }

            const salt = crypto.randomBytes(SALT_LENGTH);
            const iv = crypto.randomBytes(IV_LENGTH);
            const key = this.deriveKey(salt);

            const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
            cipher.setAutoPadding(true);

            let encryptedData = cipher.update(token, 'utf8', 'base64');
            encryptedData += cipher.final('base64');

            const tag = cipher.getAuthTag();

            return {
                encryptedData,
                iv: iv.toString('base64'),
                salt: salt.toString('base64'),
                tag: tag.toString('base64')
            };
        } catch (error) {
            throw new Error('Failed to encrypt token');
        }
    }
}

async function fixEncryptedTokens() {
    const tokenService = new TokenEncryptionService();
    
    try {
        console.log('🔄 Connecting to MongoDB...');
        await mongoose.connect(mongoUri, {
            dbName: 'veeforedb',
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            maxPoolSize: 10,
            bufferCommands: false,
            maxIdleTimeMS: 30000,
            retryWrites: true
        });
        console.log('✅ Connected to MongoDB - veeforedb database');

        const SocialAccount = mongoose.model('SocialAccount', new mongoose.Schema({}, { strict: false }));
        
        console.log('\n🔧 Finding Instagram accounts with corrupted encrypted tokens...');
        const instagramAccounts = await SocialAccount.find({ platform: 'instagram' });
        
        let fixedCount = 0;
        let errorCount = 0;

        for (const account of instagramAccounts) {
            console.log(`\n📝 Processing account: ${account.username} (${account._id})`);
            
            if (account.encryptedAccessToken) {
                try {
                    // Try to parse the encrypted token
                    let encryptedData;
                    if (typeof account.encryptedAccessToken === 'string') {
                        try {
                            encryptedData = JSON.parse(account.encryptedAccessToken);
                        } catch (parseError) {
                            console.log('❌ Invalid JSON format, marking for reconnection');
                            await SocialAccount.updateOne(
                                { _id: account._id },
                                { 
                                    needsReconnection: true,
                                    $unset: { 
                                        encryptedAccessToken: 1,
                                        accessToken: 1 
                                    }
                                }
                            );
                            console.log('✅ Marked account for reconnection');
                            fixedCount++;
                            continue;
                        }
                    } else {
                        encryptedData = account.encryptedAccessToken;
                    }

                    // Try to decrypt the token to validate it
                    try {
                        const decryptedToken = tokenService.decryptToken(encryptedData);
                        console.log('✅ Token is valid and can be decrypted');
                        
                        // Re-encrypt with proper format to ensure consistency
                        const reEncrypted = tokenService.encryptToken(decryptedToken);
                        await SocialAccount.updateOne(
                            { _id: account._id },
                            { 
                                encryptedAccessToken: JSON.stringify(reEncrypted),
                                needsReconnection: false
                            }
                        );
                        console.log('✅ Re-encrypted token with proper format');
                        fixedCount++;
                        
                    } catch (decryptError) {
                        console.log(`❌ Cannot decrypt token: ${decryptError.message}`);
                        console.log('🔄 Marking account for reconnection');
                        
                        await SocialAccount.updateOne(
                            { _id: account._id },
                            { 
                                needsReconnection: true,
                                $unset: { 
                                    encryptedAccessToken: 1,
                                    accessToken: 1 
                                }
                            }
                        );
                        console.log('✅ Marked account for reconnection');
                        fixedCount++;
                    }
                    
                } catch (error) {
                    console.log(`❌ Error processing account: ${error.message}`);
                    errorCount++;
                }
            } else {
                console.log('⚠️ No encrypted access token found');
                await SocialAccount.updateOne(
                    { _id: account._id },
                    { needsReconnection: true }
                );
                console.log('✅ Marked account for reconnection');
                fixedCount++;
            }
        }

        console.log('\n' + '='.repeat(50));
        console.log('🎉 Token Fix Summary:');
        console.log(`Total accounts processed: ${instagramAccounts.length}`);
        console.log(`Successfully fixed: ${fixedCount}`);
        console.log(`Errors encountered: ${errorCount}`);
        console.log('\n📋 Next Steps:');
        console.log('1. Users need to reconnect their Instagram accounts');
        console.log('2. New tokens will be properly encrypted');
        console.log('3. Sync functionality should work after reconnection');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await mongoose.disconnect();
        console.log('\n🔌 Disconnected from MongoDB');
    }
}

fixEncryptedTokens();