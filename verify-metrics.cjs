const { MongoClient } = require('mongodb');

async function verify() {
    const uri = "mongodb://localhost:27017";
    const client = new MongoClient(uri);

    try {
        await client.connect();
        const db = client.db('veeforedb');

        console.log('--- Social Accounts ---');
        const accounts = await db.collection('socialaccounts').find({
            username: { $in: ['rahulc1020', 'arpit.10'] }
        }).toArray();

        accounts.forEach(acc => {
            console.log(`Account: @${acc.username}`);
            console.log(`  Total Reach: ${acc.totalReach}`);
            console.log(`  Avg Reach: ${acc.avgReach}`);
        });

        console.log('\n--- Analytics Data ---');
        const analytics = await db.collection('analytics').find({
            $or: [
                { workspaceId: "67988bef202720d2358fb907" },
                { workspaceId: "679e05f2f54a88f78082987a" }
            ]
        }).toArray();

        analytics.forEach(a => {
            console.log(`Workspace: ${a.workspaceId}, platform: ${a.platform}`);
            console.log(`  Reach: ${a.reach}`);
        });

    } finally {
        await client.close();
    }
}

verify();
