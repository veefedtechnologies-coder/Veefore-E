
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import { socialAccountRepository } from './server/repositories/SocialAccountRepository';
import { getAccessTokenFromAccount } from './server/storage/converters';
import InstagramApiService from './server/services/instagramApi';

async function checkScopes() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || '', { dbName: 'veeforedb' });
        const account = await socialAccountRepository.findById('69882372f5077d91457e876a');
        if (!account) {
            console.log('Account not found');
            return;
        }
        const token = getAccessTokenFromAccount(account);
        console.log('Token prefix: ' + token?.substring(0, 10));

        const scopes = await InstagramApiService.checkTokenPermissions(token);
        console.log('\n--- TOKEN SCOPES ---');
        console.log(JSON.stringify(scopes, null, 2));

        // Also try to fetch account insights directly to see the error
        try {
            console.log('\nTrying direct insights fetch (day)...');
            const insights = await InstagramApiService.getAccountInsights(account.accountId, token, 'day');
            console.log('Daily Insights: ' + JSON.stringify(insights));
        } catch (e: any) {
            console.log('Daily Insights Error: ' + e.message + ' (Code: ' + e.code + ')');
        }

        try {
            console.log('\nTrying direct insights fetch (days_28)...');
            const insights = await InstagramApiService.getAccountInsights(account.accountId, token, 'days_28');
            console.log('28-day Insights: ' + JSON.stringify(insights));
        } catch (e: any) {
            console.log('28-day Insights Error: ' + e.message + ' (Code: ' + e.code + ')');
        }

    } catch (err) {
        console.error('Check Scopes Failed:', err);
    } finally {
        process.exit(0);
    }
}

checkScopes();
