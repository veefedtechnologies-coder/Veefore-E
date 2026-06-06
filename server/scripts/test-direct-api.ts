import dotenv from 'dotenv';
import { InstagramApiService } from '../services/instagramApi';

dotenv.config();

async function testDirectAPI() {
    try {
        // Using stored access token from environment or hardcoded test
        const testToken = process.env.INSTAGRAM_TEST_TOKEN;
        const testAccountId = '17841470963697887'; // arpit.10's account ID

        if (!testToken) {
            console.error('❌ Set INSTAGRAM_TEST_TOKEN in environment');
            console.error('Run this with: INSTAGRAM_TEST_TOKEN="your_token" npx tsx server/scripts/test-direct-api.ts');
            process.exit(1);
        }

        console.log('\n═══════════════════════════════════════════════════════');
        console.log('🚀 CALLING INSTAGRAM API');
        console.log('═══════════════════════════════════════════════════════\n');

        const metrics = await InstagramApiService.getComprehensiveMetrics(
            testToken,
            testAccountId,
            90,
            20
        );

        console.log('\n═══════════════════════════════════════════════════════');
        console.log('📊 DEMOGRAPHICS IN RESPONSE');
        console.log('═══════════════════════════════════════════════════════\n');

        console.log('Full demographics object:');
        console.log(JSON.stringify(metrics.demographics, null, 2));

        console.log('\n🔍 Field-by-field analysis:\n');

        const fields = ['audienceGenderAge', 'audienceCity', 'audienceCountry', 'audienceActiveTime'];

        for (const field of fields) {
            const value = (metrics.demographics as any)?.[field];

            if (value === undefined) {
                console.log(`❌ ${field}: UNDEFINED`);
            } else if (value === null) {
                console.log(`⚠️  ${field}: NULL`);
            } else if (typeof value === 'object') {
                const keys = Object.keys(value);
                console.log(`✅ ${field}: ${keys.length} keys`);
                if (keys.length > 0) {
                    console.log(`   Sample:`, Object.entries(value).slice(0, 3));
                } else {
                    console.log(`   ⚠️ EMPTY OBJECT {}`);
                }
            } else {
                console.log(`❓ ${field}: ${typeof value} = ${value}`);
            }
        }

        console.log('\n═══════════════════════════════════════════════════════\n');

    } catch (error: any) {
        console.error('\n❌ Error:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

testDirectAPI();
