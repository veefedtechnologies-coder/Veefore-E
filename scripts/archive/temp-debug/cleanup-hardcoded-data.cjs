const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from server/.env
const envPath = path.join(__dirname, 'server', '.env');
console.log(`📂 Loading environment from: ${envPath}`);
dotenv.config({ path: envPath });

const uri = process.env.MONGODB_URI;

if (!uri) {
    console.error('❌ MONGODB_URI not found in server/.env file');
    process.exit(1);
}

// Mask password for logging
const maskedUri = uri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
console.log(`🔗 Connecting to: ${maskedUri}`);

async function runCleanup() {
    const client = new MongoClient(uri);

    try {
        await client.connect();
        console.log('✅ Connected to MongoDB');

        const db = client.db();
        const socialAccounts = db.collection('socialaccounts');
        const analytics = db.collection('analytics');

        // 1. Reset metrics in socialaccounts
        const saQuery = {
            $or: [
                { totalReach: 300 },
                { avgEngagement: 61 },
                { totalLikes: 17 },
                { totalComments: 904 }
            ]
        };

        const saUpdate = {
            $set: {
                totalReach: 0,
                avgReach: 0,
                avgEngagement: 0,
                engagementRate: 0,
                totalLikes: 0,
                totalComments: 0,
                avgLikes: 0,
                avgComments: 0
            }
        };

        const saResult = await socialAccounts.updateMany(saQuery, saUpdate);
        console.log(`📊 Updated ${saResult.modifiedCount} socialaccounts documents.`);

        // 2. Reset metrics in analytics (Dashboard)
        const analyticsQuery = {
            $or: [
                { reach: 300 },
                { engagement: 61 },
                { likes: 17 },
                { comments: 904 }
            ]
        };

        const analyticsUpdate = {
            $set: {
                reach: 0,
                engagement: 0,
                likes: 0,
                comments: 0
            }
        };

        const analyticsResult = await analytics.updateMany(analyticsQuery, analyticsUpdate);
        console.log(`📈 Updated ${analyticsResult.modifiedCount} analytics documents.`);

        console.log('🎉 Cleanup completed successfully.');

    } catch (error) {
        console.error('❌ Cleanup failed:', error);
    } finally {
        await client.close();
    }
}

runCleanup();
