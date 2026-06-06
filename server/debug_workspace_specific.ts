
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

const envPath = path.join(process.cwd(), '.env');
dotenv.config({ path: envPath });

const WorkspaceSchema = new mongoose.Schema({ name: String }, { strict: false });
const WorkspaceModel = mongoose.model('WorkspaceTest', WorkspaceSchema, 'workspaces');

const ContentSchema = new mongoose.Schema({}, { strict: false });
const ContentModel = mongoose.model('ContentTest2', ContentSchema, 'content');

const AnalyticsSchema = new mongoose.Schema({}, { strict: false });
const AnalyticsModel = mongoose.model('AnalyticsTest2', AnalyticsSchema, 'analytics');

const SocialAccountSchema = new mongoose.Schema({}, { strict: false });
const SocialAccountModel = mongoose.model('SocialAccountTest', SocialAccountSchema, 'socialaccounts');

const TARGET_ID = '6847b9cdfabaede1706f2994';

async function run() {
    try {
        const uri = process.env.MONGODB_URI || '';
        await mongoose.connect(uri, { dbName: 'veeforedb' });

        console.log(`Checking Workspace ID: ${TARGET_ID}`);
        const ws = await WorkspaceModel.findById(TARGET_ID);
        console.log(`Workspace exists? ${!!ws}`);
        if (ws) console.log(`Workspace Name: ${ws.name}`);

        const analyticsCount = await AnalyticsModel.countDocuments({ workspaceId: TARGET_ID });
        console.log(`Analytics Count: ${analyticsCount}`);

        const contentCount = await ContentModel.countDocuments({ workspaceId: TARGET_ID });
        console.log(`total Content Count: ${contentCount}`);

        const publishedContent = await ContentModel.countDocuments({ workspaceId: TARGET_ID, status: 'published' });
        console.log(`Published Content Count: ${publishedContent}`);

        const accounts = await SocialAccountModel.find({ workspaceId: TARGET_ID });
        console.log(`Social Accounts: ${accounts.length}`);
        accounts.forEach(a => {
            console.log(`- Platform: ${a.platform}, handle: ${a.username}, mediaCount: ${a.mediaCount}, followers: ${a.followers}`);
        });

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
