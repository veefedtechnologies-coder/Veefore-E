import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { SocialAccountModel } from '../models/Social/SocialAccount';

dotenv.config();

async function checkLastSync() {
    try {
        await mongoose.connect(process.env.MONGODB_URI!, {
            dbName: process.env.MONGODB_DB_NAME || 'veeforedb'
        });

        const account = await SocialAccountModel.findOne({
            platform: 'instagram',
            username: 'arpit.10'
        }).lean();

        if (!account) {
            console.error('Account not found');
            process.exit(1);
        }

        console.log('\n📊 Account Sync Information:\n');
        console.log(`Username: ${account.username}`);
        console.log(`Last Sync: ${account.lastSyncAt || 'NEVER'}`);
        console.log(`Updated At: ${account.updatedAt || 'unknown'}`);
        console.log(`\nCurrent Time: ${new Date().toISOString()}`);

        if (account.lastSyncAt) {
            const timeSinceSync = Date.now() - new Date(account.lastSyncAt).getTime();
            const minutesAgo = Math.floor(timeSinceSync / 1000 / 60);
            console.log(`\nTime since last sync: ${minutesAgo} minutes ago`);
        }

        console.log(`\n📋 Demographics Data:`);
        console.log(`  audienceGenderAge: ${account.audienceGenderAge ? Object.keys(account.audienceGenderAge).length : 0} keys`);
        console.log(`  audienceCity: ${account.audienceCity ? Object.keys(account.audienceCity).length : 0} keys`);
        console.log(`  audienceCountry: ${account.audienceCountry ? Object.keys(account.audienceCountry).length : 0} keys`);
        console.log(`  audienceActiveTime: ${account.audienceActiveTime ? Object.keys(account.audienceActiveTime).length : 0} keys`);

        await mongoose.disconnect();

    } catch (error: any) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

checkLastSync();
