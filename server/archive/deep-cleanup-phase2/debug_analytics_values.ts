
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

const envPath = path.join(process.cwd(), '.env');
dotenv.config({ path: envPath });

const SocialAccountSchema = new mongoose.Schema({}, { strict: false });
const SocialAccountModel = mongoose.model('SocialAccountTest', SocialAccountSchema, 'socialaccounts');
const TARGET_ID = '684402c2fd2cd4eb6521b386';

async function run() {
    try {
        const uri = process.env.MONGODB_URI || '';
        await mongoose.connect(uri, { dbName: 'veeforedb' });

        const docs = await SocialAccountModel.find({ workspaceId: TARGET_ID });
        console.log(`Found ${docs.length} social accounts.`);

        docs.forEach(d => {
            const acc = d.toObject();
            console.log(`-- Account: ${acc.platform} (${acc.username})`);
            console.log(`   totalReach: ${acc.totalReach}`);
            console.log(`   reach: ${acc.reach}`);
            console.log(`   followers: ${acc.followers}`);
        });

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
