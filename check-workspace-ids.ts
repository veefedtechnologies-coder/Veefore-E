// Check content workspaceId vs account workspaceId
import mongoose from 'mongoose';

async function checkWorkspaceIds() {
    try {
        const uri = process.env.MONGODB_URI || 'mongodb+srv://arpitchoudhary:arpitchoudhary@cluster0.rkqvl.mongodb.net/veeforedb?retryWrites=true&w=majority&appName=Cluster0';
        await mongoose.connect(uri);

        const { ContentModel } = await import('./server/models/Content/Content');
        const { SocialAccountModel } = await import('./server/models/Social/SocialAccount');

        // Get arpit.10 account
        const account = await SocialAccountModel.findOne({ username: 'arpit.10' });
        if (!account) {
            console.log('❌ Account not found');
            return;
        }

        console.log(`\n📱 Account: @${account.username}`);
        console.log(`   Account ID: ${account._id}`);
        console.log(`   Workspace ID: ${account.workspaceId}`);

        // Get all Instagram content
        const allContent = await ContentModel.find({ platform: 'instagram' }).limit(20);
        console.log(`\n📊 Total Instagram content: ${allContent.length}`);

        // Group by workspaceId
        const byWorkspace = new Map();
        allContent.forEach((c: any) => {
            const wsId = c.workspaceId?.toString() || 'null';
            byWorkspace.set(wsId, (byWorkspace.get(wsId) || 0) + 1);
        });

        console.log(`\n🗂️  Content by Workspace:`);
        byWorkspace.forEach((count, wsId) => {
            const match = wsId === account.workspaceId?.toString() ? '✅ MATCH' : '❌ MISMATCH';
            console.log(`   ${wsId}: ${count} posts ${match}`);
        });

        // Check published status
        const publishedCount = await ContentModel.countDocuments({
            platform: 'instagram',
            status: 'published'
        });
        console.log(`\n✅ Published posts: ${publishedCount}`);

        // Check matching workspace + published
        const matchingCount = await ContentModel.countDocuments({
            workspaceId: account.workspaceId,
            platform: 'instagram',
            status: 'published'
        });
        console.log(`✅ Matching workspace + published: ${matchingCount}`);

        await mongoose.disconnect();
    } catch (error: any) {
        console.error('❌ Error:', error.message);
    }
}

checkWorkspaceIds();
