import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env') });

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/veeforedb');
        console.log(`📦 MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`Error: ${(error as Error).message}`);
        process.exit(1);
    }
};

const checkAnalyticsData = async () => {
    try {
        const workspaceId = '68b723f16bcd3c9930f28762';

        // Import models with proper paths
        const AnalyticsModel = (await import('../models/Analytics/Analytics')).AnalyticsModel;
        const MetricsModel = (await import('../models/Metrics')).default;
        const { SocialAccountModel } = await import('../models/Social');

        console.log('\n🔍 Checking Analytics Collection...');
        const analyticsCount = await AnalyticsModel.countDocuments({ workspaceId });
        console.log(`   Total Analytics docs: ${analyticsCount}`);

        if (analyticsCount > 0) {
            const samples = await AnalyticsModel.find({ workspaceId }).limit(3).lean();
            console.log('   Sample Analytics:', JSON.stringify(samples, null, 2));
        }

        console.log('\n🔍 Checking Metrics Collection...');
        const metricsCount = await MetricsModel.countDocuments({ workspaceId });
        console.log(`   Total Metrics docs: ${metricsCount}`);

        if (metricsCount > 0) {
            const samples = await MetricsModel.find({ workspaceId }).limit(3).lean();
            console.log('   Sample Metrics:', JSON.stringify(samples, null, 2));
        }

        console.log('\n🔍 Checking SocialAccount Collection...');
        const accounts = await SocialAccountModel.find({ workspaceId }).lean();
        console.log(`   Total Accounts: ${accounts.length}`);
        accounts.forEach((acc: any) => {
            console.log(`   - ${acc.platform}: @${acc.username}, followers: ${acc.followersCount}, engagement: ${acc.engagementRate}`);
        });

    } catch (error) {
        console.error('❌ Check failed:', error);
    } finally {
        await mongoose.connection.close();
        process.exit();
    }
};

// Run the script
(async () => {
    await connectDB();
    await checkAnalyticsData();
})();
