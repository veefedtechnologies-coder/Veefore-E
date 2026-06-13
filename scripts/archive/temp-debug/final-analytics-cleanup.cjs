const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/veefore';
const DB_NAME = process.env.MONGODB_DB_NAME || 'veeforedb';

async function finalCleanup() {
    try {
        await mongoose.connect(MONGODB_URI, { dbName: DB_NAME });
        const Analytics = mongoose.connection.collection('analytics');

        console.log('Cleaning up all analytics for @rahulc1020 and @arpit.10...');

        // Target by metrics.username
        const result = await Analytics.updateMany(
            { "metrics.username": { $in: ['rahulc1020', 'arpit.10'] } },
            { $set: { reach: 0, impressions: 0, "metrics.avgReach": 0 } }
        );

        console.log(`Updated ${result.modifiedCount} analytics records.`);

        await mongoose.disconnect();
        console.log('Final cleanup complete.');
    } catch (error) {
        console.error(error);
    }
}

finalCleanup();
