
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

        const accounts = await SocialAccount.find({ username: 'arpit.10' }).toArray();
        console.log(`Found ${accounts.length} documents for @arpit.10:`);

        for (const [index, acc] of accounts.entries()) {
            console.log(`\n[${index}] ID: ${acc._id}`);
            console.log(`    Workspace: ${acc.workspaceId}`);
            console.log(`    Active: ${acc.isActive}`);
            console.log(`    Reach: ${acc.totalReach}`);
            console.log(`    Last Sync: ${acc.lastSyncAt}`);
            console.log(`    Token Status: ${acc.tokenStatus}`);
            console.log(`    Token Start: ${acc.accessToken ? acc.accessToken.substring(0, 10) : 'N/A'} / ${acc.encryptedAccessToken ? 'Encrypted' : 'N/A'}`);
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('Check error:', error);
    }
}

runCheck();
