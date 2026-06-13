const { MongoClient } = require('mongodb');

async function dumpWorkspace() {
    const uri = "mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
    const client = new MongoClient(uri);
    const workspaceId = "68b723f16bcd3c9930f28762";

    try {
        await client.connect();
        const db = client.db('veeforedb');

        console.log(`Dumping state for Workspace: ${workspaceId}`);

        // 1. Social Accounts
        const accounts = await db.collection('socialaccounts').find({ workspaceId }).toArray();
        console.log('\n--- Social Accounts ---');
        accounts.forEach(a => {
            console.log(`@${a.username} (${a.platform}): Reach=${a.totalReach}, Followers=${a.followersCount}, Media=${a.mediaCount}`);
        });

        // 2. Analytics
        const analytics = await db.collection('analytics').find({ workspaceId }).sort({ date: -1 }).limit(10).toArray();
        console.log('\n--- Recent Analytics ---');
        analytics.forEach(a => {
            console.log(`Date: ${a.date.toISOString()}, Platform: ${a.platform}, Reach: ${a.reach}, Follower: ${a.followers}, Engagement: ${a.engagement}`);
        });

    } finally {
        await client.close();
    }
}

dumpWorkspace();
