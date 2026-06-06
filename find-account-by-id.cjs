
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, 'server/.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/veeforedb';
const DB_NAME = process.env.MONGODB_DB_NAME || 'veeforedb';

async function runCheck() {
    const accountIdToFind = process.argv[2];
    if (!accountIdToFind) {
        console.error('Usage: node find-account-by-id.cjs <accountId>');
        process.exit(1);
    }

    try {
        await mongoose.connect(MONGODB_URI, { dbName: DB_NAME });
        const SocialAccount = mongoose.connection.collection('socialaccounts');

        console.log(`Searching for accountId: ${accountIdToFind}...`);
        const accounts = await SocialAccount.find({ accountId: accountIdToFind }).toArray();
        console.log(`Found ${accounts.length} documents:`);

        for (const [index, acc] of accounts.entries()) {
            console.log(`\n[${index}] Mongo ID: ${acc._id}`);
            console.log(`    Username: ${acc.username}`);
            console.log(`    Workspace: ${acc.workspaceId}`);
            console.log(`    Active: ${acc.isActive}`);
            console.log(`    Reach: ${acc.totalReach}`);
            console.log(`    Last Sync: ${acc.lastSyncAt}`);
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('Check error:', error);
    }
}

runCheck();
