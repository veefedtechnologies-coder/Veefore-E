import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Schema } from 'mongoose';

dotenv.config();

async function checkAllAccounts() {
    try {
        await mongoose.connect(process.env.MONGODB_URI!);
        console.log('Connected to MongoDB\n');

        const SocialAccountModel = mongoose.model('SocialAccount', new Schema({}, { strict: false }));

        // Find ALL Instagram accounts
        const allInstagramAccounts = await SocialAccountModel.find({ platform: 'instagram' });

        console.log(`Found ${allInstagramAccounts.length} Instagram accounts total:\n`);

        allInstagramAccounts.forEach((acc, idx) => {
            console.log(`Account #${idx + 1}:`);
            console.log(`  _id: ${acc.get('_id')}`);
            console.log(`  Username: @${acc.get('username')}`);
            console.log(`  Workspace ID: ${acc.get('workspaceId')}`);
            console.log(`  Is Active: ${acc.get('isActive')}`);
            console.log(`  Last Sync: ${acc.get('lastSyncAt')}`);
            console.log(`  Created: ${acc.get('createdAt')}`);
            console.log(`  Updated: ${acc.get('updatedAt')}`);
            console.log(`  Followers: ${acc.get('profileData')?.followersCount || 'N/A'}`);
            console.log('');
        });

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

checkAllAccounts();
