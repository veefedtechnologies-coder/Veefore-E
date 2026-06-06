import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

async function listAllDatabases() {
    const client = new MongoClient(process.env.MONGODB_URI as string);

    try {
        await client.connect();
        console.log('✅ Connected to MongoDB\n');

        // List all databases
        const adminDb = client.db().admin();
        const { databases } = await adminDb.listDatabases();

        console.log('📁 ALL DATABASES:');
        for (const db of databases) {
            console.log(`\n  ${db.name} (${(db.sizeOnDisk / 1024 / 1024).toFixed(2)} MB)`);

            // Check each database for socialaccounts collection with Instagram data
            const database = client.db(db.name);
            const collections = await database.listCollections().toArray();
            const hasSocialAccounts = collections.some(c => c.name === 'socialaccounts');

            if (hasSocialAccounts) {
                const socialAccounts = database.collection('socialaccounts');
                const instagramCount = await socialAccounts.countDocuments({ platform: 'instagram' });
                console.log(`    ✓ socialaccounts collection exists`);
                console.log(`    ✓ Instagram accounts: ${instagramCount}`);

                if (instagramCount > 0) {
                    const account = await socialAccounts.findOne({ platform: 'instagram' });
                    console.log(`    ✓ Username: ${account?.username}`);
                    console.log(`    ✓ audienceGenderAge: ${Object.keys(account?.audienceGenderAge || {}).length} keys`);
                    console.log(`    ✓ audienceActiveTime: ${Object.keys(account?.audienceActiveTime || {}).length} keys`);
                }
            }
        }

    } finally {
        await client.close();
        console.log('\n✅ Disconnected');
    }
}

listAllDatabases().catch(console.error);
