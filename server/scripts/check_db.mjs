import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function checkData() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        const workspaceId = '68b723f16bcd3c9930f28762';

        // Check Analytics collection
        const analyticsCount = await mongoose.connection.db.collection('analytics').countDocuments({ workspaceId });
        console.log(`\n📊 Analytics documents: ${analyticsCount}`);
        if (analyticsCount > 0) {
            const sample = await mongoose.connection.db.collection('analytics').find({ workspaceId }).limit(1).toArray();
            console.log('Sample:', JSON.stringify(sample, null, 2));
        }

        // Check Metrics collection
        const metricsCount = await mongoose.connection.db.collection('metrics').countDocuments({ workspaceId });
        console.log(`\n📈 Metrics documents: ${metricsCount}`);
        if (metricsCount > 0) {
            const sample = await mongoose.connection.db.collection('metrics').find({ workspaceId }).limit(1).toArray();
            console.log('Sample:', JSON.stringify(sample, null, 2));
        }

        // Check SocialAccount collection  
        const accounts = await mongoose.connection.db.collection('socialaccounts').find({ workspaceId }).toArray();
        console.log(`\n👥 Social Accounts: ${accounts.length}`);
        accounts.forEach(acc => {
            console.log(`  - ${acc.platform}: @${acc.username}, followers: ${acc.followersCount}`);
        });

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await mongoose.connection.close();
    }
}

checkData();
