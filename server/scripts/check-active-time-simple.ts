/**
 * Check Active Time Data - Simple Version
 * Uses direct mongoose queries to avoid import issues
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function checkActiveTimeData() {
    try {
        const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/veefore';
        const dbName = process.env.MONGODB_DB_NAME || 'veeforedb';
        await mongoose.connect(mongoUri, { dbName });
        console.log(`✅ Connected to MongoDB: ${mongoose.connection.name}`);

        const db = mongoose.connection.db;
        if (!db) {
            console.error('❌ Database connection is null');
            return;
        }

        // 1. Check social accounts collection
        console.log('\n📊 Checking socialaccounts collection...');
        const socialAccounts = db.collection('socialaccounts');
        const totalAccounts = await socialAccounts.countDocuments();
        console.log(`Found ${totalAccounts} total social accounts`);

        const accountsWithActiveTime = await socialAccounts.find({
            audienceActiveTime: { $exists: true, $ne: null }
        }).toArray();

        console.log(`${accountsWithActiveTime.length} accounts have audienceActiveTime field`);

        if (accountsWithActiveTime.length > 0) {
            console.log('\n✅ Accounts with Active Time data:');
            accountsWithActiveTime.forEach((acc: any) => {
                console.log(`  - ${acc.username} (${acc.platform})`);
                const keys = acc.audienceActiveTime ? Object.keys(acc.audienceActiveTime) : [];
                console.log(`    Data keys count: ${keys.length}`);
                console.log(`    Sample keys:`, keys.slice(0, 5));
            });
        } else {
            console.log('\n⚠️  NO accounts have audienceActiveTime data');
        }

        // 2. Check analytics collection
        console.log('\n📊 Checking analytics collection...');
        const analytics = db.collection('analytics');
        const totalAnalytics = await analytics.countDocuments();
        console.log(`Found ${totalAnalytics} total analytics records`);

        const analyticsWithActiveTime = await analytics.find({
            audienceActiveTime: { $exists: true, $ne: null }
        }).toArray();

        console.log(`${analyticsWithActiveTime.length} analytics records have audienceActiveTime field`);

        if (analyticsWithActiveTime.length > 0) {
            console.log('\n✅ Analytics with Active Time data:');
            analyticsWithActiveTime.slice(0, 3).forEach((a: any) => {
                console.log(`  - ${a.platform} on ${a.date}`);
                const entries = a.audienceActiveTime ? Object.entries(a.audienceActiveTime) : [];
                console.log(`    Total entries: ${entries.length}`);
                console.log(`    Sample data:`, entries.slice(0, 3));
            });
        } else {
            console.log('\n⚠️  NO analytics records have audienceActiveTime data');
        }

        // 3. Show all Instagram accounts and their data status
        console.log('\n📊 Instagram accounts status:');
        const instagramAccounts = await socialAccounts.find({ platform: 'instagram' }).toArray();
        console.log(`Found ${instagramAccounts.length} Instagram accounts:`);

        instagramAccounts.forEach((acc: any) => {
            const hasActiveTime = acc.audienceActiveTime && Object.keys(acc.audienceActiveTime).length > 0;
            const hasAudCity = acc.audienceCity && Object.keys(acc.audienceCity).length > 0;
            const hasAudCountry = acc.audienceCountry && Object.keys(acc.audienceCountry).length > 0;

            console.log(`\n  📱 ${acc.username}:`);
            console.log(`     Active Time: ${hasActiveTime ? '✅' : '❌'}`);
            console.log(`     City Data: ${hasAudCity ? '✅' : '❌'}`);
            console.log(`     Country Data: ${hasAudCountry ? '✅' : '❌'}`);
            console.log(`     Last Sync: ${acc.lastSyncAt || 'Never'}`);
        });

        // 4. Next steps
        console.log('\n📋 Next Steps:');
        if (accountsWithActiveTime.length === 0) {
            console.log('  1. Run Instagram sync to fetch online_followers data');
            console.log('  2. Verify account is Business/Creator with >100 followers');
            console.log('  3. Run: npm run sync-instagram');
        } else {
            console.log('  ✅ Data exists in database');
            console.log('  → Check if API endpoint is returning it correctly');
            console.log('  → Verify frontend is processing the data');
        }

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n✅ Disconnected from MongoDB');
    }
}

checkActiveTimeData();
