
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');

dotenv.config({ path: path.join(__dirname, 'server/.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/veeforedb';
const DB_NAME = 'veeforedb';

/**
 * Ported from TokenEncryptionService.ts
 */
function decryptToken(encryptedToken) {
    if (!encryptedToken || !encryptedToken.encryptedData) return null;
    try {
        const { encryptedData, iv, salt, tag, kdf } = encryptedToken;

        const ALGORITHM = 'aes-256-gcm';
        const KEY_LENGTH = 32;
        const masterKey = process.env.TOKEN_ENCRYPTION_KEY || 'veefore_token_master_2025';
        const globalSaltStr = process.env.TOKEN_ENCRYPTION_GLOBAL_SALT || 'veefore_global_salt_protection';
        const globalSalt = Buffer.from(globalSaltStr, 'utf8');
        const iterations = kdf || 100000;

        // Convert base64 strings back to buffers
        const ivBuffer = Buffer.from(iv, 'base64');
        const saltBuffer = Buffer.from(salt, 'base64');
        const tagBuffer = Buffer.from(tag, 'base64');

        // Derive key
        const saltWithGlobal = Buffer.concat([saltBuffer, globalSalt]);
        const key = crypto.pbkdf2Sync(masterKey, saltWithGlobal, iterations, KEY_LENGTH, 'sha256');

        // Decrypt
        const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer);
        decipher.setAuthTag(tagBuffer);

        let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (e) {
        console.error('Decryption failed:', e.message);
        return null;
    }
}

async function run() {
    try {
        console.log('--- DIAGNOSING @rahulc1020 (Base64) ---');
        await mongoose.connect(MONGODB_URI, { dbName: DB_NAME });
        const SocialAccount = mongoose.connection.collection('socialaccounts');

        const acc = await SocialAccount.findOne({ username: 'rahulc1020' });
        if (!acc) {
            console.error('Account @rahulc1020 not found');
            return;
        }

        console.log(`Found account. DB ID: ${acc._id}, AccountId: ${acc.accountId}`);

        const token = decryptToken(acc.encryptedAccessToken);
        if (!token) {
            console.error('Could not decrypt token');
            process.exit(1);
        }
        console.log(`Token decrypted. Prefix: ${token.substring(0, 10)}...`);

        // 1. Check Account Info
        console.log('\n--- 1. Checking Account Info (graph.instagram.com/me) ---');
        const infoUrl = `https://graph.instagram.com/v22.0/me?fields=id,username,account_type,media_count,followers_count&access_token=${token}`;
        try {
            const infoResp = await axios.get(infoUrl);
            console.log('Account Info:', JSON.stringify(infoResp.data, null, 2));
        } catch (e) {
            console.error('Info Error:', e.response?.data || e.message);
        }

        // 2. Check Media
        console.log('\n--- 2. Checking Recent Media (graph.instagram.com/me/media) ---');
        const mediaUrl = `https://graph.instagram.com/v22.0/me/media?fields=id,timestamp,caption,like_count,comments_count&limit=20&access_token=${token}`;
        try {
            const mediaResp = await axios.get(mediaUrl);
            const media = mediaResp.data.data || [];
            console.log(`Found ${media.length} media items.`);
            if (media.length > 0) {
                console.log('Listing Media Items:');
                media.forEach((m, i) => {
                    const date = new Date(m.timestamp);
                    const now = new Date();
                    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
                    console.log(` [${i}] ID: ${m.id}, Age: ${diffDays} days, Likes: ${m.like_count}, Comments: ${m.comments_count}, Time: ${m.timestamp}`);
                });
            }
        } catch (e) {
            console.error('Media Error:', e.response?.data || e.message);
        }

        // 3. Check Insights (Day)
        console.log('\n--- 3. Checking Account Insights (graph.instagram.com/me/insights?metric=reach&period=day) ---');
        const insightsUrl = `https://graph.instagram.com/v22.0/me/insights?metric=reach&period=day&access_token=${token}`;
        try {
            const insightsResp = await axios.get(insightsUrl);
            console.log('Insights:', JSON.stringify(insightsResp.data, null, 2));
        } catch (e) {
            console.error('Insights Error:', e.response?.data || e.message);
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('Final Error:', error);
    }
}

run();
