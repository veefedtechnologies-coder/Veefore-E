
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

const envPath = path.join(process.cwd(), '.env');
dotenv.config({ path: envPath });

const ContentSchema = new mongoose.Schema({
    workspaceId: String,
    status: String,
    publishedAt: Date,
    // other fields...
}, { strict: false });

const ContentModel = mongoose.model('ContentTest', ContentSchema, 'content');

async function run() {
    try {
        const uri = process.env.MONGODB_URI || '';
        if (!uri) {
            console.error('MONGODB_URI is empty!');
            process.exit(1);
        }

        await mongoose.connect(uri, { dbName: 'veeforedb' });

        const workspaceId = '6847b9cdfabaede1706f2994';

        const docs = await ContentModel.find({ workspaceId, status: 'published' });
        console.log(`Found ${docs.length} published content items.`);

        docs.forEach(d => {
            console.log(`- publishedAt: ${d.publishedAt}`);
        });

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
