const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/veefore';
const DB_NAME = process.env.MONGODB_DB_NAME || 'veeforedb';

async function verify() {
    try {
        console.log(`Connecting to database: ${DB_NAME}...`);
        await mongoose.connect(MONGODB_URI, { dbName: DB_NAME });

        const SocialAccount = mongoose.connection.collection('socialaccounts');
        const Analytics = mongoose.connection.collection('analytics');

        console.log('--- Checking for 300 Reach ---');

        const accounts = await SocialAccount.find({
            $or: [{ totalReach: 300 }, { avgReach: 300 }]
        }).toArray();
        console.log(`Social accounts with 300 reach: ${accounts.length}`);

        const analytics = await Analytics.find({
            reach: 300
        }).toArray();
        console.log(`Analytics docs with 300 reach: ${analytics.length}`);

        console.log('\n--- Specific Accounts Check ---');
        const targetAccounts = await SocialAccount.find({
            username: { $in: ['rahulc1020', 'arpit.10'] }
        }).toArray();

        targetAccounts.forEach(acc => {
            console.log(`Account: @${acc.username}`);
            console.log(`  Total Reach: ${acc.totalReach}`);
            console.log(`  Avg Reach: ${acc.avgReach}`);
        });

        await mongoose.disconnect();
        console.log('Verification finished.');
    } catch (error) {
        console.error('Verification failed:', error);
        process.exit(1);
    }
}

verify();
