
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

const envPath = path.join(process.cwd(), '.env');
dotenv.config({ path: envPath });

const AnalyticsSchema = new mongoose.Schema({ workspaceId: String, date: Date }, { strict: false });
const AnalyticsModel = mongoose.model('AnalyticsDebug', AnalyticsSchema, 'analytics');

async function checkDb() {
    try {
        const uri = process.env.MONGODB_URI || '';
        if (!uri) return;

        await mongoose.connect(uri, { dbName: 'veeforedb' });
        console.log(`Connected to DB: ${mongoose.connection.db?.databaseName}`);

        const workspaceId = '6847b9cdfabaede1706f2994';

        // Fetch all records for this workspace
        const docs = await AnalyticsModel.find({ workspaceId }).sort({ date: -1 }).limit(10).lean();

        console.log(`Found ${docs.length} records.`);

        docs.forEach((doc: any) => {
            console.log('------------------------------------------------');
            console.log(`Date: ${doc.date}`);
            console.log(`Reach: ${doc.reach}`);
            console.log(`ReachDay: ${doc.reachDay}`);
            console.log(`ReachWeek: ${doc.reachWeek}`);
            console.log(`ReachDays28: ${doc.reachDays28}`);
            console.log(`Engagement: ${doc.engagement}`);
            console.log(`id: ${doc._id}`);
        });

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

checkDb();
