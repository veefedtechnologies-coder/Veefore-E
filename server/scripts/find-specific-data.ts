
import mongoose from 'mongoose';
import { SocialAccountModel as SocialAccount } from '../models/Social/SocialAccount.ts';
import { User } from '../models/User/User.ts';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/veefore';

async function listCollections() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to:', mongoose.connection.name);

        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log('Collections:', collections.map(c => c.name));

        // Check count in each collection
        for (const col of collections) {
            const count = await mongoose.connection.db.collection(col.name).countDocuments();
            console.log(`  ${col.name}: ${count} documents`);
        }

    } catch (error) {
        console.error('Error listing collections:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected.');
    }
}

async function globalSearch() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('Connected.');

        const collections = await mongoose.connection.db.listCollections().toArray();
        const searchTerm = "arpit.10";
        console.log(`Searching for "${searchTerm}" in all ${collections.length} collections...`); // Mask password

        for (const col of collections) {
            const collection = mongoose.connection.db.collection(col.name);
            // Search for string in any field (simplified check)
            // Note: extensive regex search on all fields is hard in pure mongo query without schema knowledge,
            // so we'll do a basic find({}) and scan in memory for this debug script since data volume is low.
            const allDocs = await collection.find({}).limit(100).toArray();
            const matches = allDocs.filter(doc => JSON.stringify(doc).includes(searchTerm));

            if (matches.length > 0) {
                console.log(`✅ FOUND "${searchTerm}" in collection: ${col.name}`);
                console.log(`   Count: ${matches.length}`);
                console.log(`   Sample ID: ${matches[0]._id}`);
                console.log(`   Sample Data:`, JSON.stringify(matches[0], null, 2).substring(0, 500) + '...');
            }
        }
        console.log('Search complete.');

    } catch (error) {
        console.error('Error in global search:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected.');
    }
}

globalSearch();


// globalSearch(); call is in previous chunk

