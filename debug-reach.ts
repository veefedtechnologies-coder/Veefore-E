
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { TokenEncryptionService } from './server/security/token-encryption';

dotenv.config({ path: 'server/.env' });

async function debug() {
    try {
        console.log('Connecting to mongoose...');
        await mongoose.connect(process.env.MONGODB_URI || '', { dbName: 'veeforedb' });
        const SocialAccount = mongoose.model('SocialAccount', new mongoose.Schema({}, { strict: false }));

        console.log('Finding account...');
        const acc = await SocialAccount.findOne({ username: 'rahulc1020' });
        if (!acc) {
            console.log('Account not found');
            return;
        }

        console.log('Decrypting token...');
        const encryptionService = new TokenEncryptionService();
        const token = encryptionService.decryptToken(acc.encryptedAccessToken as any);

        const igId = acc.accountId;
        // Try Instagram Graph API first
        const url = `https://graph.instagram.com/v21.0/${igId}/insights?metric=reach&period=day&access_token=${token}`;

        console.log('Fetching insights from:', url.replace(token, 'REDACTED'));
        const resp = await fetch(url);
        const data = await resp.json();
        console.log('Account Day Reach:', JSON.stringify(data, null, 2));

        if (data.data) {
            const values = data.data[0].values;
            console.log('Recent reach values:', values.slice(-5));
        } else {
            // Try Facebook Graph API as fallback
            const fbUrl = `https://graph.facebook.com/v21.0/${igId}/insights?metric=reach&period=day&access_token=${token}`;
            console.log('Fetching insights from FB URL:', fbUrl.replace(token, 'REDACTED'));
            const fbResp = await fetch(fbUrl);
            const fbData = await fbResp.json();
            console.log('Account Day Reach (FB):', JSON.stringify(fbData, null, 2));
        }

    } catch (error) {
        console.error('Error during debug:', error);
    } finally {
        process.exit(0);
    }
}

debug();
