
import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import * as path from 'path';
import axios from 'axios';
import { tokenEncryption } from './server/security/token-encryption.ts';

dotenv.config({ path: path.join(__dirname, 'server/.env') });

// Since we are running manually, we might need to set the environment variables that TokenEncryptionService expects
process.env.TOKEN_ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY || '1907535313&9!2^3*5d8b0c+-=563bf_3467:6e74cfe2c@06$3bce5600bd4aba';
process.env.TOKEN_ENCRYPTION_GLOBAL_SALT = process.env.TOKEN_ENCRYPTION_GLOBAL_SALT || '8d148018566c696f0dfbda2d10b8abdd100354ce54e5dce4ad4f8954caaf2673';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/veefore';
const DB_NAME = process.env.MONGODB_DB_NAME || 'veeforedb';

async function testInstagramApi(token: string, accountId: string, username: string) {
    try {
        console.log(`\nTesting API for @${username}...`);

        // 1. Basic Account Info
        const infoUrl = `https://graph.instagram.com/v22.0/${accountId}?fields=id,username,account_type,followers_count&access_token=${token}`;
        const infoRes = await axios.get(infoUrl);
        console.log(`  API Account Type: ${infoRes.data.account_type}`);
        console.log(`  API Followers: ${infoRes.data.followers_count}`);

        if (infoRes.data.account_type === 'BUSINESS' || infoRes.data.account_type === 'CREATOR') {
            const periods = ['day', 'week', 'days_28'];
            for (const period of periods) {
                const insightsUrl = `https://graph.facebook.com/v22.0/${accountId}/insights?metric=reach&period=${period}&access_token=${token}`;
                try {
                    const insightsRes = await axios.get(insightsUrl);
                    const reachValue = insightsRes.data.data?.[0]?.values?.[0]?.value || 0;
                    console.log(`  API Reach (${period}): ${reachValue}`);
                } catch (err: any) {
                    console.log(`  API Reach (${period}) Error: ${err.response?.data?.error?.message || err.message}`);
                }
            }
        } else {
            console.log(`  API Reach: Not supported for Personal/Basic accounts`);
        }
    } catch (error: any) {
        console.error(`  API Test Failed for @${username}:`, error.response?.data?.error?.message || error.message);
    }
}

async function runDiagnostic() {
    try {
        console.log('Connecting to DB:', MONGODB_URI);
        await mongoose.connect(MONGODB_URI, { dbName: DB_NAME });
        const SocialAccount = mongoose.connection.collection('socialaccounts');

        const usernames = ['rahulc1020', 'arpit.10'];
        const accounts = await SocialAccount.find({ username: { $in: usernames } }).toArray();

        console.log(`Found ${accounts.length} accounts`);

        for (const acc of accounts) {
            console.log(`\nDB Account: @${acc.username}`);
            console.log(`  DB Account Type: ${acc.accountType}`);
            console.log(`  DB Reach stored: ${acc.totalReach}`);

            const encryptedToken = acc.encryptedAccessToken;
            if (encryptedToken) {
                try {
                    const token = tokenEncryption.decryptToken(encryptedToken);
                    console.log(`  Token: Decrypted successfully (${token.substring(0, 10)}...)`);
                    await testInstagramApi(token, acc.accountId, acc.username);
                } catch (decryptError: any) {
                    console.log(`  Token Decryption Failed: ${decryptError.message}`);
                    // Fallback to plain text if it looks like one
                    if (typeof acc.accessToken === 'string' && acc.accessToken.startsWith('IG')) {
                        console.log(`  Trying legacy plain text token...`);
                        await testInstagramApi(acc.accessToken, acc.accountId, acc.username);
                    }
                }
            } else if (acc.accessToken) {
                console.log(`  Token: Plain text found`);
                await testInstagramApi(acc.accessToken, acc.accountId, acc.username);
            } else {
                console.log(`  Token: Missing`);
            }
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('Diagnostic error:', error);
    }
}

runDiagnostic();
