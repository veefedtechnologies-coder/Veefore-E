import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function inspectAnalytics() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        const workspaceId = '68b723f16bcd3c9930f28762';
        const db = mongoose.connection.client.db('veeforedb');

        // Get the Analytics document
        console.log('\n📊 Analytics Document:');
        const analytics = await db.collection('analytics').find({ workspaceId }).toArray();
        console.log(JSON.stringify(analytics, null, 2));

        // Get the Metrics documents
        console.log('\n\n📈 Metrics Documents:');
        const metrics = await db.collection('metrics').find({ workspaceId }).toArray();
        console.log(JSON.stringify(metrics, null, 2));

        // Get ALL social accounts to see the mismatch
        console.log('\n\n👥 ALL Social Accounts in veeforedb:');
        const accounts = await db.collection('socialaccounts').find({}).toArray();
        console.log(`Total accounts: ${accounts.length}`);
        accounts.forEach(acc => {
            console.log(`  - ${acc.platform}: @${acc.username} (workspace: ${acc.workspaceId})`);
        });

    } catch (error) {
        console.error('❌ Error:', error.message, error.stack);
    } finally {
        await mongoose.connection.close();
    }
}

inspectAnalytics();
