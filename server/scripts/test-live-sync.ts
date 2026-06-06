import dotenv from 'dotenv';
import { InstagramApiService } from '../services/instagramApi';
import mongoose from 'mongoose';
import { SocialAccountModel } from '../models/Social/SocialAccount';
import { decrypt } from '../storage/converters';


dotenv.config();

async function testLiveSync() {
    try {
        await mongoose.connect(process.env.MONGODB_URI!, {
            dbName: process.env.MONGODB_DB_NAME || 'veeforedb'
        });

        console.log('\n🔍 Fetching account and token...\n');

        const account = await SocialAccountModel.findOne({
            platform: 'instagram',
            username: 'arpit.10'
        });

        if (!account) {
            console.error('❌ Account not found');
            process.exit(1);
        }

        if (!account.accessToken) {
            console.error('❌ No access token');
            process.exit(1);
        }

        const decryptedToken = decrypt(account.accessToken);
        console.log(`✅ Token decrypted successfully`);
        console.log(`📝 Account ID from DB: ${account.accountId}\n`);

        console.log('═══════════════════════════════════════════════════════');
        console.log('🚀 CALLING INSTAGRAM API - ONLINE_FOLLOWERS');
        console.log('═══════════════════════════════════════════════════════\n');

        // Call the API directly to see the response
        const metrics = await InstagramApiService.getComprehensiveMetrics(
            decryptedToken,
            account.accountId,
            90,
            20
        );

        console.log('\n═══════════════════════════════════════════════════════');
        console.log('📊 DEMOGRAPHICS RESPONSE');
        console.log('═══════════════════════════════════════════════════════\n');

        console.log('Full demographics object:');
        console.log(JSON.stringify(metrics.demographics, null, 2));

        console.log('\n🎯 Specific Field Analysis:\n');
        console.log(`audienceGenderAge: ${metrics.demographics?.audienceGenderAge ? Object.keys(metrics.demographics.audienceGenderAge).length + ' keys' : 'undefined/null'}`);
        if (metrics.demographics?.audienceGenderAge) {
            console.log(`  Sample:`, Object.entries(metrics.demographics.audienceGenderAge).slice(0, 3));
        }

        console.log(`\nadienceCity: ${metrics.demographics?.audienceCity ? Object.keys(metrics.demographics.audienceCity).length + ' keys' : 'undefined/null'}`);

        console.log(`\nadienceCountry: ${metrics.demographics?.audienceCountry ? Object.keys(metrics.demographics.audienceCountry).length + ' keys' : 'undefined/null'}`);

        console.log(`\n✨ audienceActiveTime: ${metrics.demographics?.audienceActiveTime ? Object.keys(metrics.demographics.audienceActiveTime).length + ' keys' : 'undefined/null'}`);
        if (metrics.demographics?.audienceActiveTime) {
            console.log(`  Type: ${typeof metrics.demographics.audienceActiveTime}`);
            console.log(`  Keys:`, Object.keys(metrics.demographics.audienceActiveTime));
            console.log(`  Full object:`, metrics.demographics.audienceActiveTime);
        } else {
            console.log(`  ❌ Field is ${metrics.demographics?.audienceActiveTime === undefined ? 'undefined' : 'null or empty'}`);
        }

        console.log('\n═══════════════════════════════════════════════════════\n');

        await mongoose.disconnect();

    } catch (error: any) {
        console.error('\n❌ Error:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

testLiveSync();
