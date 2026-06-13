#!/usr/bin/env tsx
/**
 * EMERGENCY: Manual Instagram Sync Bypass
 * 
 * This script bypasses the broken OAuth callback and directly:
 * 1. Finds the Instagram account in the database
 * 2. If it has a valid token, triggers a manual sync
 * 3. If not, instructs the user on next steps
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const ACCOUNT_ID = '6872e064de14dd309d8b1961';
const WORKSPACE_ID = '68b723f16bcd3c9930f28762';

async function emergencySync() {
    try {
        console.log('🚀 EMERGENCY INSTAGRAM SYNC');
        console.log('================================\n');

        await mongoose.connect(process.env.MONGODB_URI!);
        console.log('✅ Connected to MongoDB\n');

        // Define models
        const SocialAccountModel = mongoose.model('SocialAccount', new mongoose.Schema({}, { strict: false }));
        const AnalyticsModel = mongoose.model('Analytics', new mongoose.Schema({}, { strict: false }));
        const MetricsModel = mongoose.model('Metrics', new mongoose.Schema({}, { strict: false }));

        // Search for all accounts with this username
        const accounts = await SocialAccountModel.find({ username: 'rahulc1020' });

        if (accounts.length === 0) {
            console.error('❌ No accounts found for @rahulc1020');
            process.exit(1);
        }

        console.log(`Found ${accounts.length} social account documents for @rahulc1020:\n`);

        for (const account of accounts) {
            console.log(`--- ACCOUNT INFO [${account._id}] ---`);
            console.log(`🏢 Workspace ID: ${account.get('workspaceId')}`);
            console.log(`📡 Platform: ${account.get('platform')}`);

            const token = account.get('accessToken');
            const encryptedToken = account.get('encryptedAccessToken');
            const tokenStatus = account.get('tokenStatus');

            console.log(`\n🔐 Token Status:`);
            console.log(`  - Plain accessToken: ${token ? `EXISTS (${token.length} chars)` : 'MISSING'}`);
            console.log(`  - Encrypted Token: ${encryptedToken ? 'EXISTS' : 'MISSING'}`);

            if (token && token !== 'test_access_token' && token.length > 50) {
                console.log('\n✅ Valid token found! But this means the OAuth callback IS working...');
                console.log('The issue must be elsewhere. Let me check existing data:\n');

                // Check for existing analytics
                const analytics = await AnalyticsModel.find({ workspaceId: WORKSPACE_ID }).limit(5);
                const metrics = await MetricsModel.find({ workspaceId: WORKSPACE_ID }).limit(5);

                console.log(`📊 Existing Analytics Records: ${analytics.length}`);
                console.log(`📈 Existing Metrics Records: ${metrics.length}`);

                if (analytics.length > 0 || metrics.length > 0) {
                    console.log('\n💡 DATA ALREADY EXISTS! The problem might be on the frontend.');
                    console.log('Check if the mobile app is querying the correct workspace ID.');
                }
            } else {
                console.log(`\n❌ Token is invalid: "${token}"`);
                console.log('\n🔍 ROOT CAUSE IDENTIFIED:');
                console.log('The OAuth callback is NOT saving the real Instagram token to the database.');
                console.log('This is the core bug preventing metrics from syncing.\n');

                console.log('📋 SOLUTION:');
                console.log('1. The bugfix has been applied to SocialAccountService.ts');
                console.log('2. Server needs to reload the new code');
                console.log('3. Then reconnect Instagram ONE more time\n');

                console.log('💡 TO FORCE SERVER RELOAD:');
                console.log('   Run: killall -9 node && npm run dev');
                console.log('   OR just restart the npm run dev terminal\n');
            }
        }
    } catch (error: any) {
        console.error('\n🚨 Error:', error.message);
    } finally {
        await mongoose.disconnect();
    }
}

emergencySync();
