// Direct test of Instagram API to see what's being returned
import axios from 'axios';
import mongoose from 'mongoose';

async function testInstagramAPI() {
    try {
        // Connect to DB
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/veeforedb');

        // Get arpit.10 account
        const { SocialAccountModel } = await import('./server/models/Social/SocialAccount');
        const { getAccessTokenFromAccount } = await import('./server/storage/converters');

        const account = await SocialAccountModel.findOne({ username: 'arpit.10' });
        if (!account) {
            console.log('❌ Account not found');
            return;
        }

        console.log(`\n📱 Testing Instagram API for @${account.username}`);
        console.log(`Account ID: ${account.accountId}`);

        const token = await getAccessTokenFromAccount(account);
        if (!token) {
            console.log('❌ No valid token');
            return;
        }

        console.log(`✅ Token retrieved: ${token.substring(0, 30)}...`);

        // Test 1: Get account info
        console.log('\n=== TEST 1: Account Info ===');
        try {
            const accountUrl = `https://graph.instagram.com/me?fields=id,username,media_count&access_token=${token}`;
            const accountResp = await axios.get(accountUrl);
            console.log(`Username: ${accountResp.data.username}`);
            console.log(`Media Count: ${accountResp.data.media_count}`);
        } catch (e: any) {
            console.log('❌ Account info failed:', e.response?.data || e.message);
        }

        // Test 2: Get media (first page)
        console.log('\n=== TEST 2: Media Fetch (limit=100) ===');
        try {
            const mediaUrl = `https://graph.instagram.com/me/media?fields=id,media_type,timestamp,caption&limit=100&access_token=${token}`;
            const mediaResp = await axios.get(mediaUrl);
            console.log(`✅ Fetched ${mediaResp.data.data.length} posts`);
            console.log(`Has next page: ${!!mediaResp.data.paging?.next}`);

            if (mediaResp.data.data.length > 0) {
                console.log('\nFirst 3 posts:');
                mediaResp.data.data.slice(0, 3).forEach((post: any, i: number) => {
                    console.log(`  ${i + 1}. ${post.id} - ${post.media_type} - ${new Date(post.timestamp).toLocaleDateString()}`);
                });
            } else {
                console.log('⚠️  No posts returned!');
            }
        } catch (e: any) {
            console.log('❌ Media fetch failed:', e.response?.data || e.message);
        }

        // Test 3: Check what's in ContentModel
        console.log('\n=== TEST 3: ContentModel Check ===');
        const { ContentModel } = await import('./server/models/Content/Content');
        const savedContent = await ContentModel.find({
            workspaceId: account.workspaceId,
            platform: 'instagram'
        }).limit(10);
        console.log(`Saved posts in DB: ${savedContent.length}`);
        if (savedContent.length > 0) {
            console.log('Sample saved posts:');
            savedContent.forEach((post: any, i: number) => {
                console.log(`  ${i + 1}. ${post.contentData?.id} - ${post.status} - ${new Date(post.publishedAt).toLocaleDateString()}`);
            });
        }

        await mongoose.disconnect();
    } catch (error: any) {
        console.error('\n❌ Error:', error.message);
        if (error.response?.data) {
            console.error('API Response:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

testInstagramAPI();
