
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

        const acc = await SocialAccount.findOne({ username: 'arpit.10' });
        if (acc) {
            console.log('--- Full SocialAccount Doc for @arpit.10 ---');
            console.log(JSON.stringify(acc, null, 2));
        } else {
            console.log('Account @arpit.10 not found');
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('Check error:', error);
    }
}

runCheck();
