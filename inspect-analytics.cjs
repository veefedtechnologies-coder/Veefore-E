const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/veefore';
const DB_NAME = process.env.MONGODB_DB_NAME || 'veeforedb';

async function inspectAnalytics() {
    try {
        await mongoose.connect(MONGODB_URI, { dbName: DB_NAME });
        const Analytics = mongoose.connection.collection('analytics');
        const doc = await Analytics.findOne({});
        console.log('Sample Analytics Doc:', JSON.stringify(doc, null, 2));
        await mongoose.disconnect();
    } catch (error) {
        console.error(error);
    }
}

inspectAnalytics();
