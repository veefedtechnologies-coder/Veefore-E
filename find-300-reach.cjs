const { MongoClient } = require('mongodb');

async function findHardcodedMetrics() {
    // Authoritative URI from .env
    const uri = "mongodb+srv://socialapi:jL5819777%21@veefore.8687t.mongodb.net/veefore?retryWrites=true&w=majority&appName=Veefore";
    const client = new MongoClient(uri);

    try {
        await client.connect();
        const db = client.db('veefore');

        console.log('--- Searching for hardcoded metrics (Reach: 300, Engagement: 61, or Likes: 17) ---');

        // Check socialaccounts
        const accounts = await db.collection('socialaccounts').find({
            $or: [
                { totalReach: 300 },
                { avgEngagement: 61 },
                { totalLikes: 17 },
                { totalComments: 904 }
            ]
        }).toArray();

        console.log(`\nFound ${accounts.length} social accounts with potential fallback values.`);
        accounts.forEach(a => {
            console.log('\n[Social Account]');
            console.log(JSON.stringify(a, null, 2));
        });

        // Check analytics
        const analytics = await db.collection('analytics').find({
            $or: [
                { reach: 300 },
                { engagement: 61 },
                { likes: 17 },
                { comments: 904 }
            ]
        }).toArray();

        console.log(`\nFound ${analytics.length} analytics documents with potential fallback values.`);
        analytics.forEach(a => {
            console.log('\n[Analytics Document]');
            console.log(JSON.stringify(a, null, 2));
        });

    } catch (err) {
        console.error('Error during search:', err);
    } finally {
        await client.close();
    }
}

findHardcodedMetrics();
