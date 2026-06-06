
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config();
dotenv.config({ path: 'server/.env' });

// Adjust paths to import from build or use tsx to resolve them
import { socialAccountRepository } from './server/repositories/SocialAccountRepository';
import { getAccessTokenFromAccount } from './server/storage/converters';
import InstagramApiService from './server/services/instagramApi';

async function diagnose() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || '', { dbName: 'veeforedb' });
        const account = await socialAccountRepository.findById('6988a1a0e8690f3ad6b816c0');
        if (!account) {
            console.log('Account not found');
            return;
        }

        const token = getAccessTokenFromAccount(account);
        console.log('Account: ' + account.username);
        console.log('Token prefix: ' + token?.substring(0, 10));

        console.log('Fetching metrics with 90 day lookback...');
        const data = await InstagramApiService.getComprehensiveMetrics(token, account.accountId, 90);

        console.log('\n--- API Data Summary ---');
        console.log('Followers: ' + data.account.followers_count);
        console.log('Media Found (last 90d): ' + data.recentMedia.length);
        console.log('Account insights (reach): ' + (data.insights.reach ?? 'N/A'));

        console.log('\n--- Aggregated Metrics (from recent media) ---');
        console.log('Total Likes: ' + data.aggregated.totalLikes);
        console.log('Total Comments: ' + data.aggregated.totalComments);
        console.log('Total Shares: ' + data.aggregated.totalShares);
        console.log('Total Saves: ' + data.aggregated.totalSaves);
        console.log('Total Reach: ' + data.aggregated.totalReach);
        console.log('Avg Engagement Rate: ' + data.aggregated.averageEngagementRate + '%');

        if (data.recentMedia.length > 0) {
            console.log('\n--- First Media Item ---');
            const first = data.recentMedia[0];
            console.log('ID: ' + first.id);
            console.log('Type: ' + first.media_type);
            console.log('Timestamp: ' + first.timestamp);
            console.log('Insights: ' + JSON.stringify(first.insights));
        }

    } catch (err) {
        console.error('Diagnosis Failed:', err);
    } finally {
        process.exit(0);
    }
}

diagnose();
