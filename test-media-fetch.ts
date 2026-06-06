// Quick test to see what media is being fetched for arpit.10
import axios from 'axios';

const ACCOUNT_ID = '698e04b61475122a5a72c0e2'; // arpit.10 from debug-db
const WORKSPACE_ID = '6847b9cdfabaede1706f2994';

async function testMediaFetch() {
    try {
        // Get the account from DB to get the token
        const mongoose = await import('mongoose');
        const { SocialAccountModel } = await import('./server/models/Social/SocialAccount');
        const { getAccessTokenFromAccount } = await import('./server/storage/converters');

        await mongoose.default.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/veeforedb');

        const account = await SocialAccountModel.findById(ACCOUNT_ID);
        if (!account) {
            console.log('Account not found');
            return;
        }

        const token = await getAccessTokenFromAccount(account);
        if (!token) {
            console.log('No valid token');
            return;
        }

        console.log(`Testing media fetch for @${account.username}`);
        console.log(`Token: ${token.substring(0, 20)}...`);

        // Fetch media directly from Instagram
        const url = `https://graph.instagram.com/me/media?fields=id,media_type,timestamp,caption&limit=100&access_token=${token}`;
        const response = await axios.get(url);

        console.log(`\n=== MEDIA FETCH RESULTS ===`);
        console.log(`Total media items: ${response.data.data.length}`);
        console.log(`Has next page: ${!!response.data.paging?.next}`);

        if (response.data.data.length > 0) {
            console.log(`\nFirst 5 posts:`);
            response.data.data.slice(0, 5).forEach((media: any, i: number) => {
                console.log(`${i + 1}. ${media.id} - ${media.media_type} - ${media.timestamp}`);
            });

            // Check date range
            const timestamps = response.data.data.map((m: any) => new Date(m.timestamp));
            const oldest = new Date(Math.min(...timestamps.map(d => d.getTime())));
            const newest = new Date(Math.max(...timestamps.map(d => d.getTime())));
            console.log(`\nDate range: ${oldest.toISOString()} to ${newest.toISOString()}`);

            // Check how many are within 365 days
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - 365);
            const within365 = response.data.data.filter((m: any) => new Date(m.timestamp) >= cutoff);
            console.log(`Posts within last 365 days: ${within365.length}`);
        } else {
            console.log('\nNo media found!');
        }

        await mongoose.default.disconnect();
    } catch (error: any) {
        console.error('Error:', error.message);
        if (error.response?.data) {
            console.error('API Error:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

testMediaFetch();
