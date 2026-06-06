import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB_NAME || 'veeforedb';

async function comprehensiveCleanup() {
    try {
        console.log('🧹 Starting comprehensive cleanup...\n');
        console.log('Connecting to DB:', DB_NAME);
        await mongoose.connect(MONGODB_URI!, { dbName: DB_NAME });

        const workspaceId = '6847b9cdfabaede1706f2994';

        // Define models
        const SocialAccount = mongoose.model('SocialAccount', new mongoose.Schema({}, { strict: false }), 'socialaccounts');
        const Analytics = mongoose.model('Analytics', new mongoose.Schema({}, { strict: false }), 'analytics');
        const AnalyticsCap = mongoose.model('AnalyticsCap', new mongoose.Schema({}, { strict: false }), 'Analytics');
        const Content = mongoose.model('Content', new mongoose.Schema({}, { strict: false }), 'contents');
        const Metrics = mongoose.model('Metrics', new mongoose.Schema({}, { strict: false }), 'metrics');

        console.log(`\n📊 Scanning workspace: ${workspaceId}\n`);

        // 1. Delete Social Accounts
        console.log('1️⃣ Deleting Social Accounts...');
        const socialAccounts = await SocialAccount.find({ workspaceId, platform: 'instagram' });
        console.log(`   Found ${socialAccounts.length} Instagram account(s)`);
        if (socialAccounts.length > 0) {
            const deleted = await SocialAccount.deleteMany({ workspaceId, platform: 'instagram' });
            console.log(`   ✅ Deleted ${deleted.deletedCount} social account(s)`);
        }

        // 2. Delete Analytics
        console.log('\n2️⃣ Deleting Analytics data...');
        const analyticsCount = await Analytics.countDocuments({ workspaceId });
        console.log(`   Found ${analyticsCount} analytics record(s)`);
        if (analyticsCount > 0) {
            const deleted = await Analytics.deleteMany({ workspaceId });
            console.log(`   ✅ Deleted ${deleted.deletedCount} analytics record(s)`);
        }

        const analyticsCapCount = await AnalyticsCap.countDocuments({ workspaceId });
        if (analyticsCapCount > 0) {
            const deleted = await AnalyticsCap.deleteMany({ workspaceId });
            console.log(`   ✅ Deleted ${deleted.deletedCount} AnalyticsCap record(s)`);
        }

        // 3. Delete Content
        console.log('\n3️⃣ Deleting Content...');
        const contentCount = await Content.countDocuments({ workspaceId });
        console.log(`   Found ${contentCount} content item(s)`);
        if (contentCount > 0) {
            const deleted = await Content.deleteMany({ workspaceId });
            console.log(`   ✅ Deleted ${deleted.deletedCount} content item(s)`);
        }

        // 4. Delete Metrics
        console.log('\n4️⃣ Deleting Metrics...');
        const metricsCount = await Metrics.countDocuments({ workspaceId });
        console.log(`   Found ${metricsCount} metrics record(s)`);
        if (metricsCount > 0) {
            const deleted = await Metrics.deleteMany({ workspaceId });
            console.log(`   ✅ Deleted ${deleted.deletedCount} metrics record(s)`);
        }

        console.log('\n✅ Comprehensive cleanup complete!');
        console.log('\n📝 Next step: Reconnect your Instagram account in the app.');

    } catch (e: any) {
        console.error('❌ Error during cleanup:', e);
    } finally {
        await mongoose.disconnect();
        setTimeout(() => process.exit(0), 1000);
    }
}

comprehensiveCleanup();
