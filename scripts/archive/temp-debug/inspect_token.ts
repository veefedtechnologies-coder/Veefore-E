#!/usr/bin/env tsx
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const ACCOUNT_ID = '6872e064de14dd309d8b1961';

async function inspectToken() {
    try {
        await mongoose.connect(process.env.MONGODB_URI!);
        console.log('Connected to MongoDB\n');

        const SocialAccount = mongoose.model('SocialAccount', new mongoose.Schema({}, { strict: false }));
        const account = await SocialAccount.findById(ACCOUNT_ID).lean();

        if (!account) {
            console.error(`Account ${ACCOUNT_ID} not found`);
            process.exit(1);
        }

        console.log('=== Instagram Account Details ===\n');
        console.log(`Username: @${account.username}`);
        console.log(`Platform: ${account.platform}`);
        console.log(`Workspace ID: ${account.workspaceId}`);
        console.log(`Is Active: ${account.isActive}`);
        console.log(`Last Sync: ${account.lastSyncAt}\n`);

        console.log('=== Token Information ===\n');
        console.log(`Has accessToken field: ${!!account.accessToken}`);
        console.log(`Has encryptedAccessToken field: ${!!account.encryptedAccessToken}`);

        if (account.accessToken) {
            const token = account.accessToken;
            console.log(`\nAccess Token Type: ${typeof token}`);
            console.log(`Access Token Length: ${token?.length || 0}`);
            console.log(`Access Token Preview: ${token?.substring(0, 50)}...`);
            console.log(`Starts with 'IGAA': ${token?.startsWith('IGAA')}`);
            console.log(`Starts with 'EAA': ${token?.startsWith('EAA')}`);
        }

        if (account.encryptedAccessToken) {
            const encrypted = account.encryptedAccessToken;
            console.log(`\nEncrypted Token Type: ${typeof encrypted}`);
            if (typeof encrypted === 'object') {
                console.log(`Encrypted Token Keys: ${Object.keys(encrypted).join(', ')}`);
                console.log(`Encrypted Token IV: ${encrypted.iv ? 'present' : 'missing'}`);
                console.log(`Encrypted Token content: ${encrypted.content ? 'present' : 'missing'}`);
            }
        }

        console.log(`\n=== Profile Data ===`);
        console.log(JSON.stringify(account.profileData, null, 2));

    } catch (error: any) {
        console.error('Error:', error.message);
    } finally {
        await mongoose.disconnect();
    }
}

inspectToken();
