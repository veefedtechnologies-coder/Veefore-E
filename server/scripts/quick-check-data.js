import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function checkData() {
    try {
        const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/veefore';
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB\n');

        // Check SocialAccounts
        console.log('📊 Checking SocialAccounts...');
        const accounts = await mongoose.connection.db.collection('socialaccounts').find({}).toArray();
        console.log(`Found ${accounts.length} accounts\n`);

        const withActiveTime = accounts.filter(acc =>
            acc.audienceActiveTime && Object.keys(acc.audienceActiveTime).length > 0
        );

        if (withActiveTime.length > 0) {
            console.log(`✅ ${withActiveTime.length} accounts have audienceActiveTime:`);
            withActiveTime.forEach(acc => {
                console.log(`  - ${acc.username} (${acc.platform})`);
                const keys = Object.keys(acc.audienceActiveTime);
                console.log(`    Keys: ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? '...' : ''}`);
                console.log(`    Total time slots: ${keys.length}`);
            });
        } else {
            console.log('⚠️  NO accounts have audienceActiveTime data\n');
            console.log('📋 This means:');
            console.log('  1. Instagram API hasn\'t returned online_followers data yet');
            console.log('  2. OR account doesn\'t meet requirements (Business/Creator, >100 followers)');
            console.log('  3. OR sync hasn\'t run since the feature was implemented\n');
        }

        // Check Analytics
        console.log('\n📊 Checking Analytics records...');
        const analytics = await mongoose.connection.db.collection('analytics').find({}).toArray();
        console.log(`Found ${analytics.length} analytics records\n`);

        const analyticsWithActiveTime = analytics.filter(a =>
            a.audienceActiveTime && Object.keys(a.audienceActiveTime).length > 0
        );

        if (analyticsWithActiveTime.length > 0) {
            console.log(`✅ ${analyticsWithActiveTime.length} analytics have audienceActiveTime`);
        } else {
            console.log('⚠️  NO analytics records have audienceActiveTime data');
        }

        // Show account details
        console.log('\n📊 All Social Accounts:');
        accounts.forEach(acc => {
            console.log(`  - ${acc.username} (${acc.platform})`);
            console.log(`    Business: ${acc.isBusinessAccount || false}`);
            console.log(`    Followers: ${acc.followersCount || 0}`);
            console.log(`    Has city data: ${acc.audienceCity ? Object.keys(acc.audienceCity).length : 0} cities`);
            console.log(`    Has country data: ${acc.audienceCountry ? Object.keys(acc.audienceCountry).length : 0} countries`);
            console.log(`    Has gender/age: ${acc.audienceGenderAge ? Object.keys(acc.audienceGenderAge).length : 0} entries`);
            console.log(`    Has active time: ${acc.audienceActiveTime ? Object.keys(acc.audienceActiveTime).length : 0} time slots`);
        });

        console.log('\n✅ Next Steps:');
        if (withActiveTime.length === 0) {
            console.log('  Run: npm run sync-instagram');
            console.log('  This will fetch online_followers data from Instagram');
        } else {
            console.log('  Data exists! Check API response in browser logs');
        }

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n✅ Disconnected');
    }
}

checkData();
