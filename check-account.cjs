
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, 'server/.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/veeforedb';
const DB_NAME = process.env.MONGODB_DB_NAME || 'veeforedb';

async function runCheck() {
    const username = process.argv[2];
    if (!username) {
        console.error('Usage: node check-account.cjs <username>');
        process.exit(1);
    }

    try {
        await mongoose.connect(MONGODB_URI, { dbName: DB_NAME });
        const SocialAccount = mongoose.connection.collection('socialaccounts');

        const accounts = await SocialAccount.find({ username }).toArray();
        console.log(`Found ${accounts.length} documents for @${username}:`);

        for (const [index, acc] of accounts.entries()) {
            console.log(`\n[${index}] ID: ${acc._id}`);
            console.log(`    AccountId: ${acc.accountId}`);
            console.log(`    Workspace: ${acc.workspaceId}`);
            console.log(`    Platform: ${acc.platform}`);
            console.log(`    Active: ${acc.isActive}`);
            console.log(`    Reach: ${acc.totalReach}`);
            console.log(`    Last Sync: ${acc.lastSyncAt}`);
            // Safe display of token status
            console.log(`    Token: ${acc.accessToken ? 'Present (Plain)' : (acc.encryptedAccessToken ? 'Present (Encrypted)' : 'Missing')}`);
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('Check error:', error);
    }
}

runCheck();
