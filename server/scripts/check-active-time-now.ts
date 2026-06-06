import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function checkActiveTimeData() {
    try {
        await mongoose.connect(process.env.MONGODB_URI as string);
        console.log('✅ Connected to MongoDB\n');

        // Define schemas
        const analyticsSchema = new mongoose.Schema({}, { strict: false, collection: 'analytics' });
        const socialAccountSchema = new mongoose.Schema({}, { strict: false, collection: 'socialaccounts' });

        const Analytics = mongoose.model('Analytics', analyticsSchema);
        const SocialAccount = mongoose.model('SocialAccount', socialAccountSchema);

        // 1. Check latest analytics record
        console.log('📊 ANALYTICS COLLECTION:');
        const latestAnalytics = await Analytics.findOne().sort({ recordedAt: -1 }).lean();

        if (latestAnalytics) {
            console.log('  Latest record found:');
            console.log('    recordedAt:', latestAnalytics.recordedAt);
            console.log('    audienceActiveTime:', latestAnalytics.audienceActiveTime
                ? `${Object.keys(latestAnalytics.audienceActiveTime).length} entries`
                : '❌ MISSING');
            console.log('    audienceGenderAge:', latestAnalytics.audienceGenderAge
                ? `${Object.keys(latestAnalytics.audienceGenderAge).length} entries`
                : 'missing');

            if (latestAnalytics.audienceActiveTime) {
                console.log('\n    Sample Active Time data:');
                const entries = Object.entries(latestAnalytics.audienceActiveTime).slice(0, 3);
                entries.forEach(([key, value]) => console.log(`      ${key}: ${value}`));
            }
        } else {
            console.log('  ⚠️  No analytics records found');
        }

        // 2. Check social account
        console.log('\n📱 SOCIAL ACCOUNT COLLECTION:');
        const account = await SocialAccount.findOne({ platform: 'instagram' }).lean();

        if (account) {
            console.log('  Instagram account found:');
            console.log('    username:', (account as any).username);
            console.log('    audienceActiveTime:', (account as any).audienceActiveTime
                ? `${Object.keys((account as any).audienceActiveTime).length} entries`
                : '❌ MISSING');
            console.log('    audienceGenderAge:', (account as any).audienceGenderAge
                ? `${Object.keys((account as any).audienceGenderAge).length} entries`
                : 'missing');
            console.log('    lastSyncAt:', (account as any).lastSyncAt);

            if ((account as any).audienceActiveTime) {
                console.log('\n    Sample Active Time data:');
                const entries = Object.entries((account as any).audienceActiveTime).slice(0, 3);
                entries.forEach(([key, value]) => console.log(`      ${key}: ${value}`));
            }
        } else {
            console.log('  ⚠️  No Instagram account found');
        }

        console.log('\n✅ Done');
        await mongoose.disconnect();
    } catch (error: any) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

checkActiveTimeData();
