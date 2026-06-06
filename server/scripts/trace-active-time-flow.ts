import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { SocialAccountModel } from '../models/Social/SocialAccount';
import { AnalyticsModel } from '../models/Analytics/Analytics';
import axios from 'axios';

dotenv.config();

async function traceActiveTimeFlow() {
    try {
        await mongoose.connect(process.env.MONGODB_URI!, {
            dbName: process.env.MONGODB_DB_NAME || 'veeforedb'
        });
        console.log('✅ Connected to database\n');

        // Step 1: Check SocialAccount collection
        console.log('══════════════════════════════════════════════════════');
        console.log('STEP 1: Check SocialAccount Collection');
        console.log('══════════════════════════════════════════════════════\n');

        const account = await SocialAccountModel.findOne({
            platform: 'instagram',
            username: 'arpit.10'
        }).lean();

        if (!account) {
            console.error('❌ Account not found');
            process.exit(1);
        }

        console.log(`Account ID: ${account._id}`);
        console.log(`Workspace ID: ${account.workspaceId}\n`);

        console.log('Demographics in SocialAccount:');
        console.log(`  audienceGenderAge: ${account.audienceGenderAge ? Object.keys(account.audienceGenderAge).length + ' keys' : 'NOT PRESENT'}`);
        if (account.audienceGenderAge) {
            console.log(`    Sample keys:`, Object.keys(account.audienceGenderAge).slice(0, 3));
        }
        console.log(`  audienceCity: ${account.audienceCity ? Object.keys(account.audienceCity).length + ' keys' : 'NOT PRESENT'}`);
        console.log(`  audienceCountry: ${account.audienceCountry ? Object.keys(account.audienceCountry).length + ' keys' : 'NOT PRESENT'}`);
        console.log(`  audienceActiveTime: ${account.audienceActiveTime ? Object.keys(account.audienceActiveTime).length + ' keys' : 'NOT PRESENT'}`);
        if (account.audienceActiveTime) {
            console.log(`    Sample keys:`, Object.keys(account.audienceActiveTime).slice(0, 3));
            console.log(`    Sample values:`, Object.entries(account.audienceActiveTime).slice(0, 3));
        }
        console.log();

        // Step 2: Check Analytics collection
        console.log('══════════════════════════════════════════════════════');
        console.log('STEP 2: Check Analytics Collection');
        console.log('══════════════════════════════════════════════════════\n');

        const analytics = await AnalyticsModel.find({
            workspaceId: account.workspaceId
        })
            .sort({ timestamp: -1 })
            .limit(3)
            .lean();

        console.log(`Found ${analytics.length} analytics records for this workspace\n`);

        if (analytics.length > 0) {
            const latest = analytics[0];
            console.log(`Latest Analytics Record (${latest.timestamp}):`);
            console.log(`  audienceGenderAge: ${latest.audienceGenderAge ? Object.keys(latest.audienceGenderAge).length + ' keys' : 'NOT PRESENT'}`);
            if (latest.audienceGenderAge) {
                console.log(`    Sample:`, Object.entries(latest.audienceGenderAge).slice(0, 3));
            }
            console.log(`  audienceCity: ${latest.audienceCity ? Object.keys(latest.audienceCity).length + ' keys' : 'NOT PRESENT'}`);
            console.log(`  audienceCountry: ${latest.audienceCountry ? Object.keys(latest.audienceCountry).length + ' keys' : 'NOT PRESENT'}`);
            console.log(`  audienceActiveTime: ${latest.audienceActiveTime ? Object.keys(latest.audienceActiveTime).length + ' keys' : 'NOT PRESENT'}`);
            if (latest.audienceActiveTime) {
                console.log(`    Sample:`, Object.entries(latest.audienceActiveTime).slice(0, 3));
            }
            console.log();
        } else {
            console.log('⚠️  No analytics records found!\n');
        }

        // Step 3: Call the actual API endpoint
        console.log('══════════════════════════════════════════════════════');
        console.log('STEP 3: Test API Endpoint Response');
        console.log('══════════════════════════════════════════════════════\n');

        const apiUrl = `http://localhost:5001/api/v1/analytics/performance-summary?accountId=${account._id}`;
        console.log(`Calling: ${apiUrl}\n`);

        try {
            const response = await axios.get(apiUrl);
            const data = response.data;

            console.log('✅ API Response received\n');
            console.log('Response structure:');
            console.log(`  success: ${data.success}`);
            console.log(`  data exists: ${!!data.data}`);

            if (data.data) {
                console.log(`  data.audience exists: ${!!data.data.audience}`);

                if (data.data.audience) {
                    console.log('\nAudience data in API response:');
                    console.log(`  genderAge: ${data.data.audience.genderAge ? Object.keys(data.data.audience.genderAge).length + ' keys' : 'NOT PRESENT'}`);
                    if (data.data.audience.genderAge) {
                        console.log(`    Sample:`, Object.entries(data.data.audience.genderAge).slice(0, 3));
                    }
                    console.log(`  city: ${data.data.audience.city ? Object.keys(data.data.audience.city).length + ' keys' : 'NOT PRESENT'}`);
                    console.log(`  country: ${data.data.audience.country ? Object.keys(data.data.audience.country).length + ' keys' : 'NOT PRESENT'}`);
                    console.log(`  activeTime: ${data.data.audience.activeTime ? Object.keys(data.data.audience.activeTime).length + ' keys' : 'NOT PRESENT'}`);
                    if (data.data.audience.activeTime) {
                        console.log(`    Sample:`, Object.entries(data.data.audience.activeTime).slice(0, 3));
                    }
                }
            }

            console.log('\n📋 Full API Response:');
            console.log(JSON.stringify(data, null, 2));

        } catch (error: any) {
            console.error('❌ API call failed:');
            console.error(`  Status: ${error.response?.status}`);
            console.error(`  Message: ${error.message}`);
            if (error.response?.data) {
                console.error(`  Response:`, JSON.stringify(error.response.data, null, 2));
            }
        }

        console.log('\n══════════════════════════════════════════════════════');
        console.log('DIAGNOSIS COMPLETE');
        console.log('══════════════════════════════════════════════════════\n');

        await mongoose.disconnect();

    } catch (error: any) {
        console.error('❌ Script failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

traceActiveTimeFlow();
