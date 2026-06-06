const crypto = require('crypto');
const { MongoClient } = require('mongodb');

// Configuration
const TOKEN_ENCRYPTION_KEY = '1907535313&9!2^3*5d8b0c+-=563bf_3467:6e74cfe2c@06$3bce5600bd4aba';
const MONGODB_URI = 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const DB_NAME = 'veeforedb';

// Decryption constants
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const SALT_LENGTH = 32;
const TAG_LENGTH = 16;
const ITERATIONS = 100000;

function decryptToken(encryptedToken) {
    try {
        const { encryptedData, iv, salt, tag, kdf } = encryptedToken;

        const ivBuffer = Buffer.from(iv, 'base64');
        const saltBuffer = Buffer.from(salt, 'base64');
        const tagBuffer = Buffer.from(tag, 'base64');

        // Derive key
        const iterations = kdf || ITERATIONS;
        const key = crypto.pbkdf2Sync(TOKEN_ENCRYPTION_KEY, saltBuffer, iterations, KEY_LENGTH, 'sha256');

        const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer);
        decipher.setAuthTag(tagBuffer);

        let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (error) {
        console.error('Decryption failed:', error.message);
        return null;
    }
}

async function diagnose() {
    let client;
    try {
        console.log('Connecting to DB...');
        client = new MongoClient(MONGODB_URI);
        await client.connect();
        const db = client.db(DB_NAME);
        const collection = db.collection('socialaccounts');

        console.log('Fetching account for arpit.10...');
        const account = await collection.findOne({ username: 'arpit.10' });

        if (!account) {
            console.error('Account not found!');
            return;
        }

        console.log('Account Info:', {
            username: account.username,
            accountId: account.accountId,
            totalReach: account.totalReach
        });

        let token = null;
        if (account.encryptedAccessToken) {
            console.log('Decrypting token...');
            token = decryptToken(account.encryptedAccessToken);
        }

        if (!token) {
            console.error('No access token available!');
            return;
        }

        const accountId = account.accountId;

        // 1. Account Insights (28 Days)
        console.log('\n--- 1. Testing Account Insights (reach, period=days_28) ---');
        try {
            const insightResp = await fetch(`https://graph.facebook.com/v22.0/${accountId}/insights?metric=reach&period=days_28&access_token=${token}`);
            const insightData = await insightResp.json();
            console.log('Status:', insightResp.status);
            if (insightData.error) {
                console.log('Error:', JSON.stringify(insightData.error, null, 2));
            } else {
                console.log('Data:', JSON.stringify(insightData.data, null, 2));
            }
        } catch (e) {
            console.error('Fetch 1 failed:', e.message);
        }

        // 2. Account Insights (Day)
        console.log('\n--- 2. Testing Account Insights (reach, period=day) ---');
        try {
            const insightDayResp = await fetch(`https://graph.facebook.com/v22.0/${accountId}/insights?metric=reach&period=day&access_token=${token}`);
            const insightDayData = await insightDayResp.json();
            console.log('Status:', insightDayResp.status);
            if (insightDayData.error) {
                console.log('Error:', JSON.stringify(insightDayData.error, null, 2));
            } else {
                console.log('Data (last 2 days):', JSON.stringify(insightDayData.data?.[0]?.values?.slice(-2), null, 2));
            }
        } catch (e) {
            console.error('Fetch 2 failed:', e.message);
        }

        // 3. Media Insights
        console.log('\n--- 3. Testing Media Insights (Last 20 Posts) ---');
        try {
            const mediaResp = await fetch(`https://graph.instagram.com/me/media?fields=id,caption,timestamp,media_type&limit=20&access_token=${token}`);
            const mediaData = await mediaResp.json();

            if (mediaData.data && mediaData.data.length > 0) {
                let mediaReachSum = 0;
                console.log(`Analyzing ${mediaData.data.length} media items...`);
                for (const media of mediaData.data) {
                    try {
                        const postInsightResp = await fetch(`https://graph.facebook.com/v22.0/${media.id}/insights?metric=reach&access_token=${token}`);
                        const postInsightData = await postInsightResp.json();

                        if (postInsightData.error) {
                            console.log(`Post ${media.id} Error: ${postInsightData.error.message}`);
                            continue;
                        }

                        const reach = postInsightData.data?.[0]?.values?.[0]?.value || 0;
                        console.log(`Post ${media.id} (${media.media_type}, ${media.timestamp}) Reach: ${reach}`);
                        mediaReachSum += reach;
                    } catch (pe) {
                        console.error(`Post ${media.id} fetch failed:`, pe.message);
                    }
                }
                console.log(`\nTotal Media Reach Sum (Top 20): ${mediaReachSum}`);
                console.log(`Workspace/Account Reach in DB: 749`);
            } else {
                console.log('No recent media found.');
            }
        } catch (e) {
            console.error('Fetch 3 failed:', e.message);
        }

    } catch (e) {
        console.error('Diagnosis failed:', e);
    } finally {
        if (client) await client.close();
    }
}

diagnose();
