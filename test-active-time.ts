import { connectionManager } from './server/infrastructure/mongodb-connection';
import { SocialAccountModel } from './server/models/Social/SocialAccount';
import { convertSocialAccountWithDecryptedTokens } from './server/storage/converters';
import * as dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

async function testActiveTime() {
    try {
        await connectionManager.connect();
        const accountId = '69899bfd8041d0cc5940e75f';
        const account = await SocialAccountModel.findById(accountId);

        if (!account) {
            console.error('Account not found');
            return;
        }

        console.log('Follower Count:', account.followersCount);

        const accountWithToken = convertSocialAccountWithDecryptedTokens(account);
        const token = accountWithToken.accessToken;

        if (!token) {
            console.error('No token found');
            return;
        }

        const instagramAccountId = account.accountId;
        console.log(`Testing online_followers for ${instagramAccountId}`);

        // Variant 1: lifetime (The most standard one, even if it failed before with breakdown)
        // Try WITHOUT breakdown first to see if values appear if we have enough followers
        let url = `https://graph.facebook.com/v22.0/${instagramAccountId}/insights?metric=online_followers&period=lifetime&access_token=${token}`;
        console.log('Requesting Variant 1 (No breakdown):', url);
        try {
            const response = await axios.get(url);
            console.log('Response Variant 1:', JSON.stringify(response.data, null, 2));
        } catch (e: any) {
            console.error('Variant 1 failed:', e.response ? JSON.stringify(e.response.data) : e.message);
        }

    } catch (err: any) {
        console.error('Script failed:', err.message);
    } finally {
        process.exit(0);
    }
}

testActiveTime();
