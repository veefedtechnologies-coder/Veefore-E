const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/veefore';
const DB_NAME = process.env.MONGODB_DB_NAME || 'veeforedb';

async function forceReset() {
    try {
        console.log(`Connecting to database: ${DB_NAME}...`);
        await mongoose.connect(MONGODB_URI, { dbName: DB_NAME });

        const SocialAccount = mongoose.connection.collection('socialaccounts');
        const Analytics = mongoose.connection.collection('analytics');

        console.log('Force resetting metrics for @rahulc1020 and @arpit.10...');

        const accountResult = await SocialAccount.updateMany(
            { username: { $in: ['rahulc1020', 'arpit.10'] } },
            { $set: { totalReach: 0, avgReach: 0, totalImpressions: 0, lastSyncAt: new Date() } }
        );
        console.log(`Updated ${accountResult.modifiedCount} social accounts.`);

        // Reset ALL analytics for these workspaces just to be sure
        const analyticsResult = await Analytics.updateMany(
            { workspaceId: { $in: ["67988bef202720d2358fb907", "679e05f2f54a88f78082987a"] } },
            { $set: { reach: 0, impressions: 0 } }
        );
        console.log(`Updated ${analyticsResult.modifiedCount} analytics records.`);

        await mongoose.disconnect();
        console.log('Force reset completed.');
    } catch (error) {
        console.error('Force reset failed:', error);
        process.exit(1);
    }
}

forceReset();
