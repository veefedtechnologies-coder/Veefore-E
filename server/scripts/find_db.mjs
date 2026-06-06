import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function findCorrectDB() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // Get list of all databases
        const admin = mongoose.connection.db.admin();
        const { databases } = await admin.listDatabases();

        console.log('\n📦 Available databases:');
        databases.forEach(db => {
            console.log(`  - ${db.name} (${(db.sizeOnDisk / 1024 / 1024).toFixed(2)} MB)`);
        });

        // Check each database for our workspace
        const workspaceId = '68b723f16bcd3c9930f28762';

        for (const dbInfo of databases) {
            const db = mongoose.connection.client.db(dbInfo.name);
            const accountsCount = await db.collection('socialaccounts').countDocuments({ workspaceId });

            if (accountsCount > 0) {
                console.log(`\n✅ Found ${accountsCount} social accounts in database: ${dbInfo.name}`);

                // Check Analytics
                const analyticsCount = await db.collection('analytics').countDocuments({ workspaceId });
                console.log(`   📊 Analytics documents: ${analyticsCount}`);

                // Check Metrics
                const metricsCount = await db.collection('metrics').countDocuments({ workspaceId });
                console.log(`   📈 Metrics documents: ${metricsCount}`);

                // If we have accounts but no analytics, that's our problem!
                if (accountsCount > 0 && analyticsCount === 0) {
                    console.log(`\n⚠️  PROBLEM IDENTIFIED: SocialAccounts exist but Analytics collection is EMPTY!`);
                }
            }
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await mongoose.connection.close();
    }
}

findCorrectDB();
