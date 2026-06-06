import axios from 'axios';
import { SocialAccountModel } from '../models/Social/SocialAccount';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function testOnlineFollowersAPI() {
    try {
        // Connect to database
        await mongoose.connect(process.env.MONGODB_URI!, {
            dbName: process.env.MONGODB_DB_NAME || 'veeforedb'
        });
        console.log(`✅ Connected to database\n`);

        // Get the Instagram account
        const account = await SocialAccountModel.findOne({
            platform: 'instagram',
            username: 'arpit.10'
        });

        if (!account) {
            console.error('❌ Account not found');
            process.exit(1);
        }

        console.log(`📱 Testing online_followers API for: ${account.username}`);
        console.log(`   Account ID: ${account.accountId}`);
        console.log(`   Followers: ${account.followersCount}`);
        console.log(`   Account Type: ${account.accountType}`);
        console.log(`   Is Business: ${account.isBusinessAccount}\n`);

        // Test the API call
        const apiBase = 'https://graph.facebook.com';
        const apiVersion = 'v22.0';
        const accountId = account.accountId;
        const token = account.accessToken;

        if (!token) {
            console.error('❌ No access token found');
            process.exit(1);
        }

        const url = `${apiBase}/${apiVersion}/${accountId}/insights?metric=online_followers&period=lifetime&access_token=${token}`;

        console.log('🔍 Making API request...');
        console.log(`   URL: ${url.replace(token, 'TOKEN_HIDDEN')}\n`);

        try {
            const response = await axios.get(url, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'User-Agent': 'VeeFore/1.0',
                },
                timeout: 10000,
            });

            console.log('✅ API Request Successful!');
            console.log('📊 Response Data:', JSON.stringify(response.data, null, 2));

            if (response.data.data && response.data.data.length > 0) {
                const metricData = response.data.data.find((m: any) => m.name === 'online_followers');
                if (metricData) {
                    console.log('\n✅ Found online_followers metric!');
                    console.log('Values:', JSON.stringify(metricData.values, null, 2));
                } else {
                    console.log('\n⚠️ Response contains data but no online_followers metric');
                }
            } else {
                console.log('\n⚠️ Response data is empty');
            }

        } catch (error: any) {
            console.log('\n❌ API Request FAILED:');
            console.log('   Status:', error.response?.status);
            console.log('   Status Text:', error.response?.statusText);
            console.log('   Error Data:', JSON.stringify(error.response?.data, null, 2));

            if (error.response?.data?.error) {
                const apiError = error.response.data.error;
                console.log('\n📋 Instagram API Error Details:');
                console.log('   Code:', apiError.code);
                console.log('   Type:', apiError.type);
                console.log('   Message:', apiError.message);
                console.log('   Error Subcode:', apiError.error_subcode);
                console.log('   FB Trace ID:', apiError.fbtrace_id);
            }
        }

        await mongoose.disconnect();

    } catch (error: any) {
        console.error('❌ Script error:', error.message);
        process.exit(1);
    }
}

testOnlineFollowersAPI();
