import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function checkCollections() {
    try {
        await mongoose.connect(process.env.MONGODB_URI!, { dbName: 'veeforedb' });
        console.log('✅ Connected to MongoDB (veeforedb)\n');

        const db = mongoose.connection.db;
        const collections = await db.listCollections().toArray();

        console.log(`📂 Collections in database:`);
        for (const coll of collections) {
            const count = await db.collection(coll.name).countDocuments();
            console.log(`  - ${coll.name}: ${count} documents`);

            if (coll.name.toLowerCase().includes('social') || coll.name.toLowerCase().includes('account')) {
                const sample = await db.collection(coll.name).findOne({});
                if (sample) {
                    console.log(`    Sample keys:`, Object.keys(sample).join(', '));
                }
            }
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkCollections();
