import { SocialAccountModel } from '../models/Social/SocialAccount';
import { tokenEncryption } from '../security/token-encryption';
import axios from 'axios';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function comprehensiveTest() {
    try {
        await mongoose.connect(process.env.MONGODB_URI!, {
            dbName: process.env.MONGODB_DB_NAME || 'veeforedb'
        });
        console.log('✅ Connected to database\n');

        // Get account
        const account = await SocialAccountModel.findOne({
            platform: 'instagram',
            username: 'arpit.10'
        });

        if (!account) {
            console.error('❌ Account not found');
            process.exit(1);
        }

        console.log('📱 Account Found:');
        console.log(`   Username: ${account.username}`);
        console.log(`   Account ID: ${account.accountId}`);
        console.log(`   DB Account Type: ${account.accountType}`);
        console.log(`   DB Is Business: ${account.isBusinessAccount}\n`);

        // Decrypt token
        let token: string;
        if (account.encryptedAccessToken) {
            console.log('🔓 Decrypting encrypted access token...');
            try {
                token = tokenEncryption.decryptToken(account.encryptedAccessToken as any);
                console.log(`✅ Token decrypted successfully!`);
                console.log(`   Token preview: ${token.substring(0, 25)}...`);
                console.log(`   Token type: ${token.startsWith('IGAA') ? 'Basic Display' : token.startsWith('EAAA') ? 'Facebook/Business' : 'Unknown'}\n`);
            } catch (error: any) {
                console.error('❌ Token decryption failed:', error.message);
                process.exit(1);
            }
        } else if (account.accessToken) {
            token = account.accessToken as string;
            console.log('✅ Using plain access token\n');
        } else {
            console.error('❌ No access token found');
            process.exit(1);
        }

        // Test 1: Get account info
        console.log('═══════════════════════════════════════');
        console.log('TEST 1: Get Account Info');
        console.log('═══════════════════════════════════════\n');

        const isBasicToken = token.startsWith('IGAA');
        const apiBase = isBasicToken ? 'https://graph.instagram.com' : 'https://graph.facebook.com';
        const apiVersion = 'v22.0';

        console.log(`Token type: ${isBasicToken ? 'Basic Display (Instagram Graph)' : 'Facebook Graph (Business)'}`);
        console.log(`API Base: ${apiBase}\n`);

        try {
            const accountUrl = isBasicToken
                ? `${apiBase}/me?fields=id,username,account_type,media_count,followers_count&access_token=${token}`
                : `${apiBase}/${apiVersion}/${account.accountId}?fields=id,username,account_type,media_count,followers_count&access_token=${token}`;

            console.log(`🔍 Calling: ${accountUrl.replace(token, 'TOKEN')}\n`);
            const accountResponse = await axios.get(accountUrl);

            console.log('✅ Account Info Success:');
            console.log(JSON.stringify(accountResponse.data, null, 2));
            console.log();

            const apiAccountType = accountResponse.data.account_type;
            console.log(`📊 API Reports Account Type: ${apiAccountType}`);
            if (apiAccountType === 'PERSONAL') {
                console.log('⚠️  PROBLEM: Instagram API says this is a PERSONAL account!');
                console.log('   This means it cannot access Business/Creator insights like online_followers');
                console.log('   Even if the Instagram app shows business features.\n');
                console.log('💡 SOLUTION: The Instagram account needs to be properly set up as a Business or Creator account');
                console.log('   AND connected via Facebook OAuth (not Instagram Basic Display).\n');
            }

        } catch (error: any) {
            console.error('❌ Account Info Request Failed:');
            console.error(`   Status: ${error.response?.status}`);
            console.error(`   Error:`, JSON.stringify(error.response?.data, null, 2));
            console.log();
        }

        // Test 2: Try to fetch online_followers
        console.log('═══════════════════════════════════════');
        console.log('TEST 2: Fetch online_followers');
        console.log('═══════════════════════════════════════\n');

        if (isBasicToken) {
            console.log('⚠️  SKIPPED: Basic Display tokens do not support insights metrics');
            console.log('   You need a Facebook Graph API token (Business/Creator account)\n');
        } else {
            try {
                const insightsUrl = `${apiBase}/${apiVersion}/${account.accountId}/insights?metric=online_followers&period=lifetime&access_token=${token}`;
                console.log(`🔍 Calling: ${insightsUrl.replace(token, 'TOKEN')}\n`);

                const insightsResponse = await axios.get(insightsUrl);
                console.log('✅ online_followers Request Success:');
                console.log(JSON.stringify(insightsResponse.data, null, 2));
                console.log();

                if (insightsResponse.data.data && insightsResponse.data.data.length > 0) {
                    console.log('🎉 ACTIVE TIME DATA RECEIVED!\n');
                }

            } catch (error: any) {
                console.error('❌ online_followers Request Failed:');
                console.error(`   Status: ${error.response?.status}`);
                console.error(`   Error Code: ${error.response?.data?.error?.code}`);
                console.error(`   Error Type: ${error.response?.data?.error?.type}`);
                console.error(`   Error Message: ${error.response?.data?.error?.message}`);
                console.error(`   Error Subcode: ${error.response?.data?.error?.error_subcode}`);
                console.log();
                console.log('📋 Full Error Response:');
                console.log(JSON.stringify(error.response?.data, null, 2));
                console.log();
            }
        }

        await mongoose.disconnect();
        console.log('✅ Tests completed\n');

    } catch (error: any) {
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    }
}

comprehensiveTest();
