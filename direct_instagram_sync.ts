#!/usr/bin/env tsx
/**
 * Direct Instagram Sync Script
 * This bypasses the OAuth callback and directly syncs the Instagram account
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const ACCOUNT_ID = '6872e064de14dd309d8b1961';

async function directSync() {
    try {
        console.log('🔗 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI!);
        console.log('✅ Connected\n');

        // Get the social account directly from DB
        const SocialAccount = mongoose.model('SocialAccount', new mongoose.Schema({}, { strict: false }));
        const account = await SocialAccount.findById(ACCOUNT_ID);

        if (!account) {
            console.error(`❌ Account ${ACCOUNT_ID} not found in database`);
            process.exit(1);
        }

        console.log(`📱 Found Instagram account: @${account.get('username')}`);
        console.log(`🔐 Has access token: ${!!account.get('accessToken')}`);
        console.log(`🏢 Workspace ID: ${account.get('workspaceId')}\n`);

        // Get the access token from the encrypted field
        let accessToken = account.get('accessToken');

        if (!accessToken && account.get('encryptedAccessToken')) {
            console.log('🔓 Decrypting access token...');
            // For now, let's check if token exists in any form
            console.error('⚠️  Token is encrypted, cannot decrypt in this script');
            console.log('\nPlease restart the server to pick up code changes, then reconnect Instagram.');
            process.exit(1);
        }

        if (!accessToken) {
            console.error('❌ No access token found. Please reconnect the Instagram account.');
            process.exit(1);
        }

        console.log(`🚀 Starting Instagram API sync...\n`);

        // Test API call
        const testUrl = `https://graph.instagram.com/me?fields=id,username,followers_count&access_token=${accessToken}`;
        const response = await axios.get(testUrl);

        console.log('✅ API Response:', response.data);
        console.log(`\n📊 Followers: ${response.data.followers_count}`);
        console.log(`👤 Username: ${response.data.username}`);

        // Update the account's last sync time
        await SocialAccount.findByIdAndUpdate(ACCOUNT_ID, {
            lastSyncAt: new Date(),
            'profileData.followersCount': response.data.followers_count
        });

        console.log('\n✅ Sync completed successfully!');
        console.log('\n💡 Next step: Restart the server to load code changes, then reconnect Instagram');

    } catch (error: any) {
        console.error('\n🚨 Error:', error.message);
        if (error.response) {
            console.error('API Response:', error.response.data);
        }
    } finally {
        await mongoose.disconnect();
    }
}

directSync();
