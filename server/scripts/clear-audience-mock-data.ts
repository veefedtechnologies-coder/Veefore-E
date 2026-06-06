
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load env
dotenv.config({ path: path.join(process.cwd(), '.env') });

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB_NAME || 'veeforedb';

async function run() {
    try {
        console.log('Connecting to DB:', DB_NAME);
        await mongoose.connect(MONGODB_URI!, { dbName: DB_NAME });

        const Analytics = mongoose.model('Analytics', new mongoose.Schema({
            workspaceId: String
        }, { strict: false }), 'analytics');

        const AnalyticsCap = mongoose.model('AnalyticsCap', new mongoose.Schema({
            workspaceId: String
        }, { strict: false }), 'Analytics');

        // The workspace ID for arpit.10 as identified in previous steps
        const workspaceId = '6847b9cdfabaede1706f2994';

        console.log(`Clearing mock audience data for workspace: ${workspaceId}`);

        const update = {
            $unset: {
                audienceCity: "",
                audienceCountry: "",
                audienceGenderAge: ""
            }
        };

        const res1 = await Analytics.updateMany({ workspaceId }, update);
        console.log('Cleared from analytics (lowercase):', res1.modifiedCount);

        const res2 = await AnalyticsCap.updateMany({ workspaceId }, update);
        console.log('Cleared from Analytics (capital):', res2.modifiedCount);

        console.log('Mock data removed.');

    } catch (e: any) {
        console.error('Error:', e);
    } finally {
        await mongoose.disconnect();
        setTimeout(() => process.exit(0), 1000);
    }
}

run();
