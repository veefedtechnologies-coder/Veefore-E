// Set the encryption key BEFORE any imports that might use it
process.env.TOKEN_ENCRYPTION_KEY = '1907535313&9!2^3*5d8b0c+-=563bf_3467:6e74cfe2c@06$3bce5600bd4aba';

import mongoose from 'mongoose';
import { SocialAccountModel } from './server/models/Social/SocialAccount.ts';
import { tokenEncryption } from './server/security/token-encryption.ts';

const MONGO_URI = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const DB_NAME = process.env.MONGODB_DB_NAME || 'veeforedb';

async function diagnose() {
    try {
        console.log('Connecting to DB...');
        await mongoose.connect(MONGO_URI, { dbName: DB_NAME });

        // 1. Get the account
        console.log('Fetching account for arpit.10...');
        const account = await SocialAccountModel.findOne({ username: 'arpit.10' });

        if (!account) {
            console.error('Account not found!');
            return;
        }

        console.log('Account Info:', {
            username: account.username,
            accountType: account.accountType,
            isBusinessAccount: account.isBusinessAccount,
            totalReach: account.totalReach
        });

        // 2. Decrypt token
        let token: string | null = null;
        if (account.encryptedAccessToken) {
            console.log('Decrypting token...');
            token = tokenEncryption.decryptToken(account.encryptedAccessToken as any);
        }

        if (!token) {
            console.error('No access token available!');
            return;
        }

        console.log('Token ready. Testing API endpoints...');
        const accountId = account.accountId;

        // 3. Test API - Account Insights (28 Days)
        console.log('\n--- 1. Testing Account Insights (reach, period=days_28) ---');
        const insightResp = await fetch(`https://graph.facebook.com/v22.0/${accountId}/insights?metric=reach&period=days_28&access_token=${token}`);
        const insightData = await insightResp.json();
        console.log('Status:', insightResp.status);
        console.log('Data:', JSON.stringify(insightData, null, 2));

        // 4. Test API - Account Insights (Day)
        console.log('\n--- 2. Testing Account Insights (reach, period=day) ---');
        const insightDayResp = await fetch(`https://graph.facebook.com/v22.0/${accountId}/insights?metric=reach&period=day&access_token=${token}`);
        const insightDayData = await insightDayResp.json();
        console.log('Status:', insightDayResp.status);
        console.log('Data:', JSON.stringify(insightDayData, null, 2));

        // 5. Check Recent Media Reach Sum
        console.log('\n--- 3. Testing Media Insights (Last 5 Posts) ---');
        const mediaResp = await fetch(`https://graph.instagram.com/me/media?fields=id,caption&limit=5&access_token=${token}`);
        const mediaData = await mediaResp.json();

        if (mediaData.data && mediaData.data.length > 0) {
            let mediaReachSum = 0;
            for (const media of mediaData.data) {
                const postInsightResp = await fetch(`https://graph.facebook.com/v22.0/${media.id}/insights?metric=reach&access_token=${token}`);
                const postInsightData = await postInsightResp.json();
                const reach = postInsightData.data?.[0]?.values?.[0]?.value || 0;
                console.log(`Post ${media.id} Reach: ${reach}`);
                mediaReachSum += reach;
            }
            console.log(`\nTotal Media Reach Sum (Top 5): ${mediaReachSum}`);
        }

    } catch (e) {
        console.error('Diagnosis failed:', e);
    } finally {
        await mongoose.disconnect();
    }
}

diagnose();
