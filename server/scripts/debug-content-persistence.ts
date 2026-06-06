
import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import path from 'path';
import { SocialAccountModel } from '../models/Social/SocialAccount';
import { ContentModel } from '../models/Content/Content';

// Load env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function debugContent() {
    try {
        console.log('Connecting to DB at:', process.env.MONGODB_URI?.substring(0, 20) + '...');
        await mongoose.connect(process.env.MONGODB_URI as string);
        console.log('Connected to DB');

        const collections = await mongoose.connection.db?.listCollections().toArray();
        // console.log('Collections:', collections?.map(c => c.name));

        const count1 = await mongoose.connection.db?.collection('socialaccounts').countDocuments();
        const count2 = await mongoose.connection.db?.collection('social_accounts').countDocuments();
        console.log(`socialaccounts count: ${count1}`);
        console.log(`social_accounts count: ${count2}`);

        let accounts = [];
        if (count2 && count2 > 0) {
            accounts = await mongoose.connection.db?.collection('social_accounts').find({}).toArray();
            console.log('Using social_accounts data');
        } else {
            accounts = await SocialAccountModel.find({});
        }
        console.log(`Found ${accounts.length} total accounts`);

        accounts.forEach(acc => {
            console.log(`- ID: ${acc._id}, Platform: ${acc.platform}, User: ${acc.username}, Workspace: ${acc.workspaceId}`);
        });

        const account = accounts.find(a => a.platform.includes('instagram'));
        if (!account) {
            console.log('No Instagram-like account found');
            return;
        }

        const contentCount = await ContentModel.countDocuments({
            workspaceId: account.workspaceId,
            platform: 'instagram'
        });
        console.log(`Total Content for workspace ${account.workspaceId}: ${contentCount}`);

        const publishedContent = await ContentModel.countDocuments({
            workspaceId: account.workspaceId,
            platform: 'instagram',
            status: 'published'
        });
        console.log(`Published Content: ${publishedContent}`);

        if (contentCount > 0 && publishedContent === 0) {
            console.log('WARNING: Content exists but none are "published". checking statuses...');
            const statuses = await ContentModel.distinct('status', { workspaceId: account.workspaceId });
            console.log('Found statuses:', statuses);
        }

        const sample = await ContentModel.findOne({ workspaceId: account.workspaceId }).lean();
        if (sample) {
            console.log('Sample Content:', JSON.stringify(sample, null, 2));
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

debugContent();
