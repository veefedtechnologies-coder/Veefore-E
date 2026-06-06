import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB_NAME || 'veeforedb';

async function run() {
    try {
        console.log('Connecting to DB:', DB_NAME);
        await mongoose.connect(MONGODB_URI!, { dbName: DB_NAME });

        const SocialAccount = mongoose.model('SocialAccount', new mongoose.Schema({
            workspaceId: String,
            platform: String,
            username: String
        }, { strict: false }), 'socialaccounts');

        const workspaceId = '6847b9cdfabaede1706f2994';

        console.log(`\nFinding Instagram accounts for workspace: ${workspaceId}`);
        const accounts = await SocialAccount.find({ workspaceId, platform: 'instagram' });

        console.log(`Found ${accounts.length} Instagram account(s):`);
        accounts.forEach((acc: any) => {
            console.log(`  - ID: ${acc._id}, Username: ${acc.username}, Updated: ${acc.updatedAt}`);
        });

        if (accounts.length === 0) {
            console.log('\n✅ No accounts to delete.');
        } else {
            console.log(`\n🗑️ Deleting ${accounts.length} account(s)...`);
            const result = await SocialAccount.deleteMany({ workspaceId, platform: 'instagram' });
            console.log(`✅ Deleted ${result.deletedCount} account(s)`);
            console.log('\n📝 Next step: Reconnect your Instagram account in the app.');
            console.log('   The new connection will use the correct encryption key.');
        }

    } catch (e: any) {
        console.error('Error:', e);
    } finally {
        await mongoose.disconnect();
        setTimeout(() => process.exit(0), 1000);
    }
}

run();
