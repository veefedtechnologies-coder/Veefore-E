
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';
import { TokenEncryptionService } from './server/security/token-encryption';

dotenv.config({ path: path.join(__dirname, 'server/.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/veeforedb';
const DB_NAME = 'veeforedb';

async function run() {
    try {
        console.log('--- DIAGNOSING @rahulc1020 ---');
        await mongoose.connect(MONGODB_URI, { dbName: DB_NAME });
        const SocialAccount = mongoose.connection.collection('socialaccounts');

        const acc = await SocialAccount.findOne({ username: 'rahulc1020' });
        if (!acc) {
            console.error('Account @rahulc1020 not found');
            return;
        }

        console.log(`Found account. DB ID: ${acc._id}, AccountId: ${acc.accountId}`);

        const encryptionService = new TokenEncryptionService();
        const token = encryptionService.decryptToken(acc.encryptedAccessToken);
        console.log(`Token decrypted. Prefix: ${token.substring(0, 10)}...`);

        // 1. Check Account Info
        console.log('\n--- 1. Checking Account Info (graph.instagram.com/me) ---');
        const infoUrl = `https://graph.instagram.com/me?fields=id,username,account_type,media_count,followers_count&access_token=${token}`;
        try {
            const infoResp = await axios.get(infoUrl);
            console.log('Account Info:', JSON.stringify(infoResp.data, null, 2));
        } catch (e: any) {
            console.error('Info Error:', e.response?.data || e.message);
        }

        // 2. Check Media
        console.log('\n--- 2. Checking Recent Media (graph.instagram.com/me/media) ---');
        const mediaUrl = `https://graph.instagram.com/me/media?fields=id,timestamp,caption,like_count,comments_count&limit=10&access_token=${token}`;
        try {
            const mediaResp = await axios.get(mediaUrl);
            console.log(`Found ${mediaResp.data.data?.length || 0} media items.`);
            if (mediaResp.data.data?.length > 0) {
                console.log('Latest Media:', JSON.stringify(mediaResp.data.data[0], null, 2));
            }
        } catch (e: any) {
            console.error('Media Error:', e.response?.data || e.message);
        }

        // 3. Check Insights (Day)
        console.log('\n--- 3. Checking Account Insights (graph.instagram.com/me/insights?metric=reach&period=day) ---');
        const insightsUrl = `https://graph.instagram.com/me/insights?metric=reach&period=day&access_token=${token}`;
        try {
            const insightsResp = await axios.get(insightsUrl);
            console.log('Insights:', JSON.stringify(insightsResp.data, null, 2));
        } catch (e: any) {
            console.error('Insights Error:', e.response?.data || e.message);
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('Final Error:', error);
    }
}

run();
