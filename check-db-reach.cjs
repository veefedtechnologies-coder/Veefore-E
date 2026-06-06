
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, 'server/.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/veefore';
const DB_NAME = process.env.MONGODB_DB_NAME || 'veeforedb';

async function runCheck() {
    try {
        await mongoose.connect(MONGODB_URI, { dbName: DB_NAME });
        const SocialAccount = mongoose.connection.collection('socialaccounts');
        const Analytics = mongoose.connection.collection('analytics');

        const targets = ['rahulc1020', 'arpit.10'];

        for (const username of targets) {
            console.log(`\n--- @${username} ---`);
            const acc = await SocialAccount.findOne({ username });
            if (acc) {
                console.log(`SocialAccount:`);
                console.log(`  Account Type: ${acc.accountType}`);
                console.log(`  Total Reach Stored: ${acc.totalReach}`);
                console.log(`  Last Sync At: ${acc.lastSyncAt}`);

                const analytics = await Analytics.find({
                    workspaceId: acc.workspaceId,
                    platform: 'instagram'
                }).sort({ date: -1 }).limit(1).toArray();

                if (analytics.length > 0) {
                    console.log(`Latest Analytics Doc (${analytics[0].date}):`);
                    console.log(`  Reach: ${analytics[0].metrics?.reach}`);
                } else {
                    console.log(`Latest Analytics Doc: Not found`);
                }
            } else {
                console.log(`Account @${username} not found`);
            }
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('Check error:', error);
    }
}

runCheck();
