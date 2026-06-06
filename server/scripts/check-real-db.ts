
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load env from project root
dotenv.config({ path: path.join(process.cwd(), '.env') });

const uri = process.env.MONGODB_URI;
if (!uri) {
    console.error('MONGODB_URI not found in .env');
    process.exit(1);
}

const DB_NAME = process.env.MONGODB_DB_NAME || 'veeforedb';

async function checkRealDb() {
    console.log(`Connecting to MongoDB... (DB: ${DB_NAME})`);
    try {
        await mongoose.connect(uri!, { dbName: DB_NAME });
        console.log(`Connected to ${mongoose.connection.name}`);

        // Define minimal schema to query social accounts
        const socialSchema = new mongoose.Schema({}, { strict: false });
        const SocialAccount = mongoose.model('SocialAccount', socialSchema, 'socialaccounts');

        // Also check 'social_accounts' (underscore) just in case
        const SocialAccountUnderscore = mongoose.model('SocialAccountUnderscore', socialSchema, 'social_accounts');

        // Check Analytics collection for workspace
        const Analytics = mongoose.model('Analytics', new mongoose.Schema({
            workspaceId: String,
            audienceCity: Object,
            audienceCountry: Object,
            audienceGenderAge: Object
        }, { strict: false }), 'analytics'); // Try lowercase 'analytics' first, then 'Analytics'

        const AnalyticsCap = mongoose.model('AnalyticsCap', new mongoose.Schema({
            workspaceId: String,
            audienceCity: Object,
            audienceCountry: Object,
            audienceGenderAge: Object
        }, { strict: false }), 'Analytics');

        const wsId = '6847b9cdfabaede1706f2994';
        console.log(`Checking Analytics for workspace ${wsId}...`);

        const countA1 = await Analytics.countDocuments({ workspaceId: wsId });
        console.log(`Found ${countA1} docs in 'analytics' for workspace`);

        if (countA1 > 0) {
            const doc = await Analytics.findOne({ workspaceId: wsId }).sort({ createdAt: -1 });
            console.log('Latest doc in analytics:', JSON.stringify({
                id: doc._id,
                city: doc.audienceCity,
                country: doc.audienceCountry,
                genderAge: doc.audienceGenderAge
            }, null, 2));
        }

        const countA2 = await AnalyticsCap.countDocuments({ workspaceId: wsId });
        console.log(`Found ${countA2} docs in 'Analytics' for workspace`);

        if (countA2 > 0) {
            const doc = await AnalyticsCap.findOne({ workspaceId: wsId }).sort({ createdAt: -1 });
            console.log('Latest doc in Analytics:', JSON.stringify({
                id: doc._id,
                city: doc.audienceCity,
                country: doc.audienceCountry,
                genderAge: doc.audienceGenderAge
            }, null, 2));
        }

        // List all collections to be sure
        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log('Collections in veeforedb:', collections.map(c => c.name).join(', '));

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected.');
    }
}

checkRealDb();
