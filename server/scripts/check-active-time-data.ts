/**
 * Check Active Time Data
 * Diagnostic script to verify if audienceActiveTime exists in the database
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

        // Dynamically import models to avoid ESM issues
        const { SocialAccountModel: SocialAccount } = await import('../models/Social/SocialAccount');
        const { AnalyticsModel: Analytics } = await import('../models/Analytics/Analytics');

        // 1. Check all social accounts for audienceActiveTime
        console.log('\n📊 Checking SocialAccounts for audienceActiveTime...');
        const accounts = await SocialAccount.find({}).select('username platform audienceActiveTime').lean();

        console.log(`Found ${accounts.length} total social accounts`);

        const accountsWithActiveTime = accounts.filter((acc: any) => {
            const hasData = acc.audienceActiveTime && Object.keys(acc.audienceActiveTime).length > 0;
            return hasData;
        });

        console.log(`${accountsWithActiveTime.length} accounts have audienceActiveTime data`);

        if (accountsWithActiveTime.length > 0) {
            console.log('\n✅ Accounts with Active Time data:');
            accountsWithActiveTime.forEach((acc: any) => {
                console.log(`  - ${acc.username} (${acc.platform})`);
                console.log(`    Data keys:`, Object.keys(acc.audienceActiveTime).slice(0, 5));
            });
        } else {
            console.log('\n⚠️  NO accounts have audienceActiveTime data');
            console.log('This means the Instagram API has not returned online_followers data yet');
        }

        // 2. Check Analytics records
        console.log('\n📊 Checking Analytics for audienceActiveTime...');
        const analytics = await Analytics.find({}).select('platform date audienceActiveTime').lean();

        console.log(`Found ${analytics.length} total analytics records`);

        const analyticsWithActiveTime = analytics.filter((a: any) => {
            const hasData = a.audienceActiveTime && Object.keys(a.audienceActiveTime).length > 0;
            return hasData;
        });

        console.log(`${analyticsWithActiveTime.length} analytics records have audienceActiveTime data`);

        if (analyticsWithActiveTime.length > 0) {
            console.log('\n✅ Analytics with Active Time data:');
            analyticsWithActiveTime.slice(0, 3).forEach((a: any) => {
                console.log(`  - ${a.platform} on ${a.date}`);
                console.log(`    Sample data:`, Object.entries(a.audienceActiveTime).slice(0, 3));
            });
        } else {
            console.log('\n⚠️  NO analytics records have audienceActiveTime data');
        }

        // 3. Show what needs to happen
        console.log('\n📋 Next Steps:');
        if (accountsWithActiveTime.length === 0) {
            console.log('  1. Run Instagram sync to fetch online_followers data');
            console.log('  2. Account must be Business/Creator with >100 followers');
            console.log('  3. Run: npm run sync-instagram');
        } else {
            console.log('  ✅ Data exists! Check if API is returning it correctly');
        }

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n✅ Disconnected from MongoDB');
    }
}

checkActiveTimeData();
