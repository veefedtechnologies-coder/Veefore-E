
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env') });

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI as string);
        console.log('📦 MongoDB Connected');
    } catch (error) {
        console.error('❌ MongoDB Connection Error:', error);
        process.exit(1);
    }
};

const runDiagnostics = async () => {
    await connectDB();

    console.log('\n🔍 --- STARTING DIAGNOSTICS ---\n');

    // 1. Check SocialAccounts
    const SocialAccount = mongoose.connection.collection('socialaccounts');
    const accounts = await SocialAccount.find({}).toArray();
    console.log(`📊 Total Social Accounts: ${accounts.length}`);
    accounts.forEach(acc => {
        console.log(`   - ID: ${acc._id}`);
        console.log(`     Username: @${acc.username}`);
        console.log(`     Platform: ${acc.platform}`);
        console.log(`     WorkspaceId: ${acc.workspaceId} (Type: ${typeof acc.workspaceId})`);
        console.log(`     LastSyncAt: ${acc.lastSyncAt}`);
        console.log(`     Metrics: ${JSON.stringify(acc.metrics || {}, null, 2)}`);
        console.log('-----------------------------------');
    });

    if (accounts.length > 0) {
        const workspaceId = accounts[0].workspaceId;
        console.log(`\n🎯 Focusing on Workspace ID from first account: ${workspaceId}`);

        // 2. Check Analytics (Daily Snapshots)
        const Analytics = mongoose.connection.collection('analytics');
        const analyticsDocs = await Analytics.find({ workspaceId: workspaceId.toString() }).toArray();
        console.log(`\n📈 Analytics Docs for Workspace (String Match): ${analyticsDocs.length}`);

        // Try ObjectId match just in case
        try {
            const analyticsDocsObj = await Analytics.find({ workspaceId: new mongoose.Types.ObjectId(workspaceId) }).toArray();
            console.log(`📈 Analytics Docs for Workspace (ObjectId Match): ${analyticsDocsObj.length}`);
        } catch (e) { console.log('   (Skipped ObjectId match check)'); }

        analyticsDocs.forEach(doc => {
            console.log(`   - Date: ${doc.date} | Platform: ${doc.platform}`);
            console.log(`     Followers: ${doc.followers} | Engagement: ${doc.engagement}`);
        });

        // 3. Check Metrics (Historical)
        const Metrics = mongoose.connection.collection('metrics');
        const metricsDocs = await Metrics.find({ workspaceId: workspaceId.toString() }).toArray();
        console.log(`\n📉 Metrics Docs for Workspace: ${metricsDocs.length}`);
        metricsDocs.slice(0, 3).forEach(doc => {
            console.log(`   - Type: ${doc.metricsType} | Date: ${doc.startDate}`);
            console.log(`     Values: ${JSON.stringify(doc)}`);
        });

        // 4. Check Content (Posts)
        const Content = mongoose.connection.collection('content');
        const contentDocs = await Content.find({ workspaceId: workspaceId.toString() }).toArray();
        console.log(`\n📝 Content Docs for Workspace: ${contentDocs.length}`);
        contentDocs.slice(0, 3).forEach(doc => {
            console.log(`   - Title: ${doc.title} | Status: ${doc.status}`);
            console.log(`     Metrics: ${JSON.stringify(doc.metrics)}`);
        });

    } else {
        console.log('❌ No social accounts found to derive workspace ID.');
    }

    // 5. Force Sync for the specific account
    const targetAccountId = '6872e064de14dd309d8b1961';
    console.log(`\n🔄 --- FORCING SYNC FOR: ${targetAccountId} ---\n`);

    try {
        // Need to import service properly
        // Dynamic import to avoid initialization issues before DB connection
        const { socialAccountService } = await import('../services/SocialAccountService');

        console.log('🚀 Triggering syncAccount...');
        const result = await socialAccountService.syncAccount(targetAccountId);
        console.log('✅ Sync Completed Successfully!');
        console.log('Result:', JSON.stringify(result, null, 2));

    } catch (error) {
        console.error('🚨 SYNC FAILED:', error);
        if ('response' in (error as any)) {
            console.error('API Response Data:', (error as any).response?.data);
        }
    }

    console.log('\n🔍 --- END DIAGNOSTICS ---\n');
    process.exit(0);
};

runDiagnostics();
