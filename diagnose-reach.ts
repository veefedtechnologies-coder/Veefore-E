// Set the encryption key BEFORE any imports that might use it
process.env.TOKEN_ENCRYPTION_KEY = '1907535313&9!2^3*5d8b0c+-=563bf_3467:6e74cfe2c@06$3bce5600bd4aba';

import mongoose from 'mongoose';
import { SocialAccountModel } from './server/models/Social/SocialAccount.ts';
import { tokenEncryption } from './server/security/token-encryption.ts';
import { getAccessTokenFromAccount } from './server/storage/converters.ts';
import InstagramApiService from './server/services/instagramApi.ts';

const MONGO_URI = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const DB_NAME = process.env.MONGODB_DB_NAME || 'veeforedb';

async function diagnose() {
    try {
        console.log('Connecting to DB...');
        await mongoose.connect(MONGO_URI, { dbName: DB_NAME });

        // 1. Get the account
        console.log('Fetching account for rahulc1020...');
        const account = await SocialAccountModel.findOne({ username: 'rahulc1020' });

        if (!account) {
            console.error('Account not found!');
            return;
        }

        console.log('Account Info:', {
            username: account.username,
            accountType: account.accountType,
            isBusinessAccount: account.isBusinessAccount,
            lastSyncAt: account.lastSyncAt,
            totalReach: account.totalReach
        });

        // 2. Decrypt token
        let token = account.accessToken;
        if (!token && account.encryptedAccessToken) {
            console.log('Decrypting token...');
            token = tokenEncryption.decryptToken(account.encryptedAccessToken);
        }

        if (!token) {
            console.error('No access token available!');
            return;
        }

        console.log('Token ready. Testing API endpoints...');
        const accountId = account.accountId;

        // 3. Test API - Me Endpoint
        console.log('\n--- 1. Testing /me endpoint ---');
        const meResp = await fetch(`https://graph.instagram.com/me?fields=id,username,account_type,media_count,followers_count&access_token=${token}`);
        const meData = await meResp.json();
        console.log('Status:', meResp.status);
        console.log('Data:', JSON.stringify(meData, null, 2));

        // 4. Test API - Account Insights (28 Days)
        console.log('\n--- 2. Testing Account Insights (reach, period=days_28) ---');
        const insightResp = await fetch(`https://graph.instagram.com/${accountId}/insights?metric=reach&period=days_28&access_token=${token}`);
        const insightData = await insightResp.json();
        console.log('Status:', insightResp.status);
        console.log('Data:', JSON.stringify(insightData, null, 2));

        // 5. Test API - Account Insights (Day)
        console.log('\n--- 3. Testing Account Insights (reach, period=day) ---');
        const insightDayResp = await fetch(`https://graph.instagram.com/${accountId}/insights?metric=reach&period=day&access_token=${token}`);
        const insightDayData = await insightDayResp.json();
        console.log('Status:', insightDayResp.status);
        console.log('Data:', JSON.stringify(insightDayData, null, 2));

        // 6. Test API - Media Insights (First Post)
        if (meData.media_count > 0) {
            console.log('\n--- 4. Testing Media Insights (First Post) ---');
            const mediaResp = await fetch(`https://graph.instagram.com/me/media?fields=id,caption&limit=1&access_token=${token}`);
            const mediaData = await mediaResp.json();

            if (mediaData.data && mediaData.data.length > 0) {
                const postId = mediaData.data[0].id;
                console.log(`Testing Post ID: ${postId}`);

                const postInsightResp = await fetch(`https://graph.instagram.com/${postId}/insights?metric=reach&access_token=${token}`);
                const postInsightData = await postInsightResp.json();
                console.log('Status:', postInsightResp.status);
                console.log('Data:', JSON.stringify(postInsightData, null, 2));

                // Test Engagement metric fallback
                console.log('Testing Engagement Metric for Post...');
                const postEngResp = await fetch(`https://graph.instagram.com/${postId}/insights?metric=engagement&access_token=${token}`);
                const postEngData = await postEngResp.json();
                console.log('Engagement Data:', JSON.stringify(postEngData, null, 2));
            }
        }

    } catch (e) {
        console.error('Diagnosis failed:', e);
    } finally {
        await mongoose.disconnect();
    }
}

diagnose();
