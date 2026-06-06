import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const socialAccountSchema = new mongoose.Schema({}, { strict: false });
const SocialAccountModel = mongoose.model('SocialAccount', socialAccountSchema, 'social_accounts');

async function checkV4Data() {
    try {
        await mongoose.connect(process.env.MONGODB_URI!);
        console.log('✅ Connected to MongoDB');

        const accounts = await SocialAccountModel.find({ platform: 'instagram' });
        console.log(`\n📊 Found ${accounts.length} Instagram accounts\n`);

        for (const account of accounts) {
            console.log(`\n=== Account: @${account.username} ===`);
            console.log(`Account ID: ${account.accountId}`);
            console.log(`Media Count: ${account.mediaCount}`);
            console.log(`Followers: ${account.followersCount}`);
            console.log(`\nV4 Data (aiBestActiveTime):`);

            if (account.aiBestActiveTime) {
                console.log(JSON.stringify(account.aiBestActiveTime, null, 2));
            } else {
                console.log('❌ NO V4 DATA FOUND');
            }
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkV4Data();
