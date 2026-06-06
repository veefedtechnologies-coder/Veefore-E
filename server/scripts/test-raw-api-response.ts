#!/usr/bin/env node
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import axios from 'axios';
import { SocialAccountModel } from '../models/Social/SocialAccount';
import { getAccessTokenFromAccount } from '../storage/converters';

dotenv.config();

async function testRawAPIResponse() {
    try {
        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║  INSTAGRAM API RAW RESPONSE TEST - online_followers       ║');
        console.log('╚════════════════════════════════════════════════════════════╝\n');

        await mongoose.connect(process.env.MONGODB_URI!, {
            dbName: process.env.MONGODB_DB_NAME || 'veeforedb'
        });

        const account = await SocialAccountModel.findOne({
            platform: 'instagram',
            username: 'arpit.10'
        });

        if (!account) {
            console.error('❌ Account not found');
            process.exit(1);
        }

        const token = getAccessTokenFromAccount(account);
        if (!token) {
            console.error('❌ Failed to get access token');
            process.exit(1);
        }

        const accountId = account.accountId;

        console.log('📋 Account Information:');
        console.log(`   Username: ${account.username}`);
        console.log(`   Account ID: ${accountId}`);
        console.log(`   Last Sync: ${account.lastSyncAt}\n`);

        // Make direct API call to online_followers endpoint
        const url = `https://graph.facebook.com/v22.0/${accountId}/insights?metric=online_followers&period=lifetime&access_token=${token}`;

        console.log('🌐 API Request:');
        console.log(`   ${url.replace(token, 'REDACTED')}\n`);

        console.log('⏳ Calling Instagram API...\n');

        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'VeeFore/1.0'
            },
            timeout: 10000
        });

        console.log('═══════════════════════════════════════════════════════════\n');
        console.log('📦 FULL RAW API RESPONSE:\n');
        console.log(JSON.stringify(response.data, null, 2));
        console.log('\n═══════════════════════════════════════════════════════════\n');

        // Detailed analysis
        if (response.data?.data && Array.isArray(response.data.data)) {
            const onlineFollowersData = response.data.data.find((d: any) => d.name === 'online_followers');

            if (onlineFollowersData) {
                console.log('✅ online_followers metric FOUND in response\n');
                console.log('📊 Metric Details:');
                console.log(`   Name: ${onlineFollowersData.name}`);
                console.log(`   Period: ${onlineFollowersData.period}`);
                console.log(`   Title: ${onlineFollowersData.title}`);
                console.log(`   Description: ${onlineFollowersData.description}\n`);

                if (onlineFollowersData.values && Array.isArray(onlineFollowersData.values)) {
                    console.log(`📅 Number of value entries: ${onlineFollowersData.values.length}\n`);

                    onlineFollowersData.values.forEach((valueEntry: any, idx: number) => {
                        console.log(`   Entry ${idx + 1}:`);
                        console.log(`   - end_time: ${valueEntry.end_time}`);

                        if (valueEntry.value) {
                            const keys = Object.keys(valueEntry.value);
                            console.log(`   - value: ${keys.length} keys`);

                            if (keys.length > 0) {
                                console.log(`   ✅ DATA EXISTS! Sample keys:`);
                                keys.slice(0, 5).forEach(key => {
                                    console.log(`      ${key}: ${valueEntry.value[key]}`);
                                });
                                if (keys.length > 5) {
                                    console.log(`      ... and ${keys.length - 5} more`);
                                }
                            } else {
                                console.log(`   ⚠️  value is EMPTY object {}`);
                            }
                        } else {
                            console.log(`   ❌ value is NULL or UNDEFINED`);
                        }
                        console.log('');
                    });

                    // Check for any non-empty values
                    const nonEmptyValues = onlineFollowersData.values.filter((v: any) =>
                        v.value && Object.keys(v.value).length > 0
                    );

                    console.log('\n════════════════════════════════════════════════════════════');
                    if (nonEmptyValues.length > 0) {
                        console.log('🎉 RESULT: Instagram IS returning Active Time data!');
                        console.log(`   Found ${nonEmptyValues.length} entries with data`);
                        console.log('   → There may be a bug in our data processing code\n');
                    } else {
                        console.log('⚠️  RESULT: Instagram is NOT returning Active Time data yet');
                        console.log('   All value entries are empty objects {}');
                        console.log('   → This means Instagram hasn\'t collected enough data\n');
                        console.log('💡 Possible reasons:');
                        console.log('   1. Account recently hit 100 followers (data takes time)');
                        console.log('   2. Recent account type change to Business/Creator');
                        console.log('   3. Instagram needs more time to accumulate statistics');
                        console.log('   4. Regional or account-specific restrictions\n');
                    }
                    console.log('════════════════════════════════════════════════════════════\n');
                }
            } else {
                console.log('❌ online_followers metric NOT FOUND in response');
                console.log('   This might indicate an API permission issue\n');
            }
        } else {
            console.log('❌ Unexpected API response structure');
        }

        await mongoose.disconnect();

    } catch (error: any) {
        console.error('\n❌ ERROR:\n');

        if (error.response) {
            console.error('API Error Response:');
            console.error(JSON.stringify(error.response.data, null, 2));
            console.error(`\nStatus: ${error.response.status}`);
            console.error(`Status Text: ${error.response.statusText}`);
        } else {
            console.error(error.message);
            console.error(error.stack);
        }

        process.exit(1);
    }
}

testRawAPIResponse();
