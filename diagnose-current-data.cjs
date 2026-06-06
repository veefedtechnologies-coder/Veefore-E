
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');

dotenv.config({ path: path.join(__dirname, '.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/veefore';
const DB_NAME = process.env.MONGODB_DB_NAME || 'veeforedb';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const MASTER_KEY = process.env.TOKEN_ENCRYPTION_KEY;
if (!MASTER_KEY) {
    console.error('🚨 [DIAGNOSTIC] TOKEN_ENCRYPTION_KEY is missing from environment!');
    process.exit(1);
}
const GLOBAL_SALT_STRING = process.env.TOKEN_ENCRYPTION_GLOBAL_SALT || '';

function deriveKey(salt, iterations) {
    const globalSalt = GLOBAL_SALT_STRING ? Buffer.from(GLOBAL_SALT_STRING, 'utf8') : Buffer.alloc(0);
    const saltWithGlobal = globalSalt.length > 0 ? Buffer.concat([salt, globalSalt]) : salt;
    return crypto.pbkdf2Sync(MASTER_KEY, saltWithGlobal, iterations, KEY_LENGTH, 'sha256');
}

function decryptToken(encryptedToken) {
    if (!encryptedToken) return null;

    try {
        let tokenData;

        // 1. Handle stringified JSON (common in DB)
        if (typeof encryptedToken === 'string') {
            try {
                tokenData = JSON.parse(encryptedToken);
            } catch (e) {
                // Not JSON, return as is (plain text fallback)
                return encryptedToken;
            }
        } else if (typeof encryptedToken === 'object' && encryptedToken !== null) {
            tokenData = encryptedToken;
        } else {
            return null;
        }

        const { encryptedData, iv, salt, tag } = tokenData;

        // 2. Validate fields
        if (typeof encryptedData !== 'string' || typeof iv !== 'string' || typeof salt !== 'string' || typeof tag !== 'string') {
            // Might be plain text stored as a string or legacy format
            if (typeof encryptedData === 'string' && !iv) return encryptedData;
            return null;
        }

        // 3. Convert to buffers
        const ivBuffer = Buffer.from(iv, 'base64');
        const saltBuffer = Buffer.from(salt, 'base64');
        const tagBuffer = Buffer.from(tag, 'base64');

        // 4. Match iterations
        const iterations = typeof tokenData.kdf === 'number' ? tokenData.kdf : 100000;

        // 5. Derive key and decrypt
        const key = deriveKey(saltBuffer, iterations);
        const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer);
        decipher.setAuthTag(tagBuffer);

        let decryptedData = decipher.update(encryptedData, 'base64', 'utf8');
        decryptedData += decipher.final('utf8');
        return decryptedData;
    } catch (e) {
        console.error('Decryption failed:', e.message);
        return null;
    }
}

async function testInstagramApi(token, accountId, username) {
    try {
        console.log(`\nTesting API for @${username}...`);

        // 1. Basic Account Info
        const infoUrl = `https://graph.instagram.com/v22.0/${accountId}?fields=id,username,account_type,followers_count&access_token=${token}`;
        const infoRes = await axios.get(infoUrl);
        console.log(`  API Account Type: ${infoRes.data.account_type}`);
        console.log(`  API Followers: ${infoRes.data.followers_count}`);

        // 2. Multi-period reach testing
        if (infoRes.data.account_type === 'BUSINESS' || infoRes.data.account_type === 'CREATOR') {
            const periods = ['day', 'week', 'days_28'];
            for (const period of periods) {
                const insightsUrl = `https://graph.facebook.com/v22.0/${accountId}/insights?metric=reach&period=${period}&access_token=${token}`;
                try {
                    const insightsRes = await axios.get(insightsUrl);
                    const reachValue = insightsRes.data.data?.[0]?.values?.[0]?.value || 0;
                    console.log(`  API Reach (${period}): ${reachValue}`);
                } catch (err) {
                    console.log(`  API Reach (${period}) Error: ${err.response?.data?.error?.message || err.message}`);
                }
            }

            // 3. Media-level aggregated reach
            const mediaUrl = `https://graph.instagram.com/v22.0/${accountId}/media?fields=id,media_type&limit=10&access_token=${token}`;
            try {
                const mediaRes = await axios.get(mediaUrl);
                const media = mediaRes.data.data || [];
                let totalMediaReach = 0;
                for (const item of media) {
                    const mInsightsUrl = `https://graph.facebook.com/v22.0/${item.id}/insights?metric=reach&access_token=${token}`;
                    try {
                        const mInsightsRes = await axios.get(mInsightsUrl);
                        totalMediaReach += mInsightsRes.data.data?.[0]?.values?.[0]?.value || 0;
                    } catch (mErr) {
                        // Media insights might fail for various reasons (e.g. too old, or not enough data)
                    }
                }
                console.log(`  Aggregated Media Reach (top 10): ${totalMediaReach}`);
            } catch (mediaErr) {
                console.log(`  Media aggregation failed: ${mediaErr.message}`);
            }

        } else {
            console.log(`  API Reach: Not supported for Personal/Basic accounts`);
        }
    } catch (error) {
        console.error(`  API Test Failed for @${username}:`, error.response?.data?.error?.message || error.message);
    }
}

async function runDiagnostic() {
    try {
        await mongoose.connect(MONGODB_URI, { dbName: DB_NAME });
        const SocialAccount = mongoose.connection.collection('socialaccounts');

        const accounts = await SocialAccount.find({ username: { $in: ['rahulc1020', 'arpit.10'] } }).toArray();
        for (const acc of accounts) {
            console.log(`\nDB Account: @${acc.username}`);
            console.log(`  DB Account Type: ${acc.accountType}`);
            console.log(`  DB Reach stored: ${acc.totalReach}`);

            const token = decryptToken(acc.accessToken || acc.encryptedAccessToken);
            if (token) {
                await testInstagramApi(token, acc.accountId, acc.username);
            } else {
                console.log(`  Token: Could not decrypt or missing`);
            }
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('Diagnostic error:', error);
    }
}

runDiagnostic();
