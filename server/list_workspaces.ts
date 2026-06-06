
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

const envPath = path.join(process.cwd(), '.env');
dotenv.config({ path: envPath });

const WorkspaceSchema = new mongoose.Schema({
    name: String,
    ownerId: String,
}, { strict: false });

const WorkspaceModel = mongoose.model('WorkspaceTest', WorkspaceSchema, 'workspaces');

const ContentSchema = new mongoose.Schema({
    workspaceId: String,
    status: String,
}, { strict: false });
const ContentModel = mongoose.model('ContentTest2', ContentSchema, 'content');

const AnalyticsSchema = new mongoose.Schema({
    workspaceId: String,
}, { strict: false });
const AnalyticsModel = mongoose.model('AnalyticsTest2', AnalyticsSchema, 'analytics');

async function run() {
    try {
        const uri = process.env.MONGODB_URI || '';
        if (!uri) {
            console.error('MONGODB_URI is empty!');
            process.exit(1);
        }

        await mongoose.connect(uri, { dbName: 'veeforedb' });

        const workspaces = await WorkspaceModel.find({});
        console.log(`Found ${workspaces.length} workspaces.`);

        for (const w of workspaces) {
            const contentCount = await ContentModel.countDocuments({ workspaceId: w._id });
            const analyticsCount = await AnalyticsModel.countDocuments({ workspaceId: w._id });
            console.log(`Workspace: ${w.name} (ID: ${w._id})`);
            console.log(`  - Content: ${contentCount}`);
            console.log(`  - Analytics: ${analyticsCount}`);
        }

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
