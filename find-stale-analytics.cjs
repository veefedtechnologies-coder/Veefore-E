const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/veefore';
const DB_NAME = process.env.MONGODB_DB_NAME || 'veeforedb';

async function findStaleAnalytics() {
    try {
        await mongoose.connect(MONGODB_URI, { dbName: DB_NAME });
        const Analytics = mongoose.connection.collection('analytics');

        console.log('Searching for analytics with reach: 300');
        const docs = await Analytics.find({ reach: 300 }).toArray();
        console.log(`Found ${docs.length} documents.`);
        docs.forEach(d => {
            console.log(` - ID: ${d._id}, Workspace: ${d.workspaceId}, Reach: ${d.reach}`);
        });

        console.log('\nSearching for any analytics for @rahulc1020 (if username is in metrics)...');
        const docs2 = await Analytics.find({ "metrics.username": "rahulc1020" }).toArray();
        console.log(`Found ${docs2.length} documents for rahulc1020.`);
        docs2.forEach(d => {
            console.log(` - ID: ${d._id}, Workspace: ${d.workspaceId}, Reach: ${d.reach}`);
        });

        await mongoose.disconnect();
    } catch (error) {
        console.error(error);
    }
}

findStaleAnalytics();
