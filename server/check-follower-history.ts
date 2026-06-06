import { MongoClient } from 'mongodb';

async function checkFollowerHistory() {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/veefore';
    const client = new MongoClient(uri);

    try {
        await client.connect();
        console.log('✅ Connected to MongoDB\n');

        const db = client.db();
        const analytics = db.collection('analytics');

        // Get all analytics records sorted by date
        const records = await analytics
            .find({})
            .sort({ date: -1 })
            .limit(10)
            .toArray();

        console.log('=== ANALYTICS HISTORY (Last 10 records) ===\n');

        if (records.length === 0) {
            console.log('❌ No analytics records found!');
            console.log('This means the Smart Poller hasn\'t created any snapshots yet.\n');
            return;
        }

        records.forEach((record, index) => {
            const date = new Date(record.date).toLocaleString();
            console.log(`${index + 1}. ${date}`);
            console.log(`   Followers: ${record.followers || 'N/A'}`);
            console.log(`   Platform: ${record.platform || 'N/A'}`);
            console.log(`   Workspace: ${record.workspaceId || 'N/A'}`);
            console.log('');
        });

        // Calculate recent changes
        if (records.length >= 2) {
            console.log('=== FOLLOWER CHANGES ===\n');
            for (let i = 0; i < Math.min(3, records.length - 1); i++) {
                const newer = records[i];
                const older = records[i + 1];
                const change = (newer.followers || 0) - (older.followers || 0);
                const changeStr = change >= 0 ? `+${change}` : `${change}`;

                console.log(`${new Date(older.date).toLocaleDateString()} → ${new Date(newer.date).toLocaleDateString()}: ${changeStr} (${older.followers} → ${newer.followers})`);
            }
        }

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await client.close();
    }
}

checkFollowerHistory();
