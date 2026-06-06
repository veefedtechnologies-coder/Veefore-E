import { SocialAccountModel } from '../models/Social/SocialAccount';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function checkAccountDetails() {
    try {
        await mongoose.connect(process.env.MONGODB_URI!, {
            dbName: process.env.MONGODB_DB_NAME || 'veeforedb'
        });

        const account = await SocialAccountModel.findOne({
            platform: 'instagram',
            username: 'arpit.10'
        }).lean();

        if (!account) {
            console.error('❌ Account not found');
            process.exit(1);
        }

        console.log('📱 Instagram Account Details:\n');
        console.log('Username:', account.username);
        console.log('Platform:', account.platform);
        console.log('Account ID:', account.accountId);
        console.log('Followers:', account.followersCount);
        console.log('Account Type:', account.accountType);
        console.log('Is Business Account:', account.isBusinessAccount);
        console.log('Last Sync:', account.lastSyncAt);
        console.log('\n🔐 Authentication:');
        console.log('Workspace ID:', account.workspaceId);
        console.log('\n🔐 Authentication:');
        console.log('Has accessToken:', !!account.accessToken);
        console.log('Has encryptedAccessToken:', !!account.encryptedAccessToken);
        console.log('Token Type:', account.tokenType);

        console.log('Encrypted Token Type:', typeof account.encryptedAccessToken);
        if (typeof account.encryptedAccessToken === 'string') {
            console.log('Encrypted Token Preview:', account.encryptedAccessToken.substring(0, 20) + '...');
        } else {
            console.log('Encrypted Token Value:', account.encryptedAccessToken);
        }

        console.log('\n📊 Demographics Data:');
        console.log('audienceGenderAge keys:', Object.keys(account.audienceGenderAge || {}).length);
        console.log('audienceCity keys:', Object.keys(account.audienceCity || {}).length);
        console.log('audienceCountry keys:', Object.keys(account.audienceCountry || {}).length);
        console.log('audienceActiveTime keys:', Object.keys(account.audienceActiveTime || {}).length);

        console.log('\n🔍 Full Account Object (sensitive data masked):');
        const masked = { ...account };
        if (masked.accessToken) masked.accessToken = 'MASKED';
        if (masked.encryptedAccessToken) masked.encryptedAccessToken = 'MASKED';
        console.log(JSON.stringify(masked, null, 2));

        await mongoose.disconnect();

    } catch (error: any) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

checkAccountDetails();
