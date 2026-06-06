
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({ path: 'server/.env' });

async function check() {
    await mongoose.connect(process.env.MONGODB_URI || '', { dbName: 'veeforedb' });
    const db = mongoose.connection.db;
    const accounts = await db.collection('socialaccounts').find({}).toArray();

    console.log('--- Short WorkspaceID Check ---');
    let found = false;
    accounts.forEach(sa => {
        const wsIdStr = String(sa.workspaceId);
        if (wsIdStr.length < 24) {
            found = true;
            console.log('🚨 SHORT ID FOUND:', sa.username, 'Platform:', sa.platform, 'ID:', sa.workspaceId, 'Length:', wsIdStr.length);
        }
    });

    if (!found) {
        console.log('✅ No short workspaceIds found among', accounts.length, 'social accounts.');
    }

    console.log('\n--- Workspace ID Types ---');
    accounts.forEach(sa => {
        const type = typeof sa.workspaceId;
        const isObjectId = sa.workspaceId instanceof mongoose.Types.ObjectId || (sa.workspaceId && sa.workspaceId._bsontype === 'ObjectID');
        console.log(`Account: ${sa.username}, Type: ${type}, IsObjectId: ${isObjectId}, Value: ${sa.workspaceId}`);
    });

    process.exit(0);
}

check().catch(err => {
    console.error(err);
    process.exit(1);
});
