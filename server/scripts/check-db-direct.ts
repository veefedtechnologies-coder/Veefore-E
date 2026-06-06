import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function checkDatabase() {
    const client = new MongoClient(process.env.MONGODB_URI as string);

    try {
        await client.connect();
        console.log('✅ Connected to MongoDB\n');

        const db = client.db(); // Use default database from connection string
        console.log(`📁 Database: ${db.databaseName}\n`);

        // List all collections
        const collections = await db.listCollections().toArray();
        console.log('📚 Collections:', collections.map(c => c.name).join(', '));
        console.log();

        // Check socialaccounts collection
        console.log('📱 SOCIALACCOUNTS COLLECTION:');
        const socialAccounts = db.collection('socialaccounts');
        const account = await socialAccounts.findOne({ platform: 'instagram' });

        if (account) {
            console.log('  Found Instagram account:', account.username);
            console.log('  audienceGenderAge keys:', Object.keys(account.audienceGenderAge || {}).length);
            console.log('  audienceActiveTime keys:', Object.keys(account.audienceActiveTime || {}).length);

            if (account.audienceActiveTime && Object.keys(account.audienceActiveTime).length > 0) {
                console.log('  ✅ Active Time data EXISTS in SocialAccount!');
                const sample = Object.entries(account.audienceActiveTime).slice(0, 3);
                sample.forEach(([key, value]) => console.log(`    ${key}: ${value}`));
            } else {
                console.log('  ❌ Active Time data MISSING in SocialAccount');
            }
        } else {
            console.log('  ❌ No Instagram account found');
        }

        console.log();

        // Check analytics collection
        console.log('📊 ANALYTICS COLLECTION:');
        const analytics = db.collection('analytics');
        const latestAnalytic = await analytics.findOne({}, { sort: { recordedAt: -1 } });

        if (latestAnalytic) {
            console.log('  Found latest record:', latestAnalytic.recordedAt);
            console.log('  audienceGenderAge keys:', Object.keys(latestAnalytic.audienceGenderAge || {}).length);
            console.log('  audienceActiveTime keys:', Object.keys(latestAnalytic.audienceActiveTime || {}).length);

            if (latestAnalytic.audienceActiveTime && Object.keys(latestAnalytic.audienceActiveTime).length > 0) {
                console.log('  ✅ Active Time data EXISTS in Analytics!');
                const sample = Object.entries(latestAnalytic.audienceActiveTime).slice(0, 3);
                sample.forEach(([key, value]) => console.log(`    ${key}: ${value}`));
            } else {
                console.log('  ❌ Active Time data MISSING in Analytics');
            }
        } else {
            console.log('  ❌ No analytics records found');
        }

    } finally {
        await client.close();
        console.log('\n✅ Disconnected');
    }
}

checkDatabase().catch(console.error);
