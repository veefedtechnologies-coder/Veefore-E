
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/veefore';
const DB_NAME = process.env.MONGODB_DB_NAME || 'veeforedb';

async function cleanupData() {
    try {
        console.log(`Connecting to database: ${DB_NAME}...`);
        await mongoose.connect(MONGODB_URI, { dbName: DB_NAME });

        const SocialAccount = mongoose.connection.collection('socialaccounts');
        const Analytics = mongoose.connection.collection('analytics');

        // 1. Reset accounts with the "300" mock reach
        console.log('Resetting accounts with obvious mock reach (300)...');
        const accountResult = await SocialAccount.updateMany(
            { totalReach: 300 },
            { $set: { totalReach: 0, avgReach: 0, lastSyncAt: new Date() } }
        );
        console.log(`Updated ${accountResult.modifiedCount} social accounts.`);

        // 2. Reset analytics records that might have the mock data
        console.log('Cleaning up analytics records with mock data...');
        const analyticsResult = await Analytics.updateMany(
            { reach: 300 },
            { $set: { reach: 0 } }
        );
        console.log(`Updated ${analyticsResult.modifiedCount} analytics records.`);

        await mongoose.disconnect();
        console.log('Cleanup completed successfully.');
    } catch (error) {
        console.error('Cleanup failed:', error);
        process.exit(1);
    }
}

cleanupData();
