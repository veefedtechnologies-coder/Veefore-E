
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });
dotenv.config({ path: path.join(process.cwd(), 'server/.env') });

const MONGODB_URI = process.env.MONGODB_URI;
const TARGET_ID = '68b723f16bcd3c9930f28762';
const CURRENT_WS_ID = '6843035f111709a736159e39';

async function fixWorkspace() {
    if (!MONGODB_URI) {
        console.error('MONGODB_URI not found');
        return;
    }

    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        const db = mongoose.connection.db;

        // 1. Check if target workspace exists
        const targetWs = await db.collection('workspaces').findOne({ _id: new mongoose.Types.ObjectId(TARGET_ID) });
        if (targetWs) {
            console.log('Target workspace already exists. No change needed or potential conflict.');
        } else {
            const currentWs = await db.collection('workspaces').findOne({ _id: new mongoose.Types.ObjectId(CURRENT_WS_ID) });
            if (currentWs) {
                console.log(`Found current workspace. Cloning to ${TARGET_ID}...`);
                const newWs = { ...currentWs, _id: new mongoose.Types.ObjectId(TARGET_ID) };
                await db.collection('workspaces').insertOne(newWs);
                console.log(`Successfully created workspace with ID ${TARGET_ID}`);

                // 2. Update SocialAccounts to point to the new workspace ID
                const saResult = await db.collection('socialaccounts').updateMany(
                    { workspaceId: CURRENT_WS_ID },
                    { $set: { workspaceId: TARGET_ID } }
                );
                console.log(`Updated ${saResult.modifiedCount} social accounts to use target workspace ID`);

                // 3. Update Users to point to the new workspace ID
                const userResult = await db.collection('users').updateMany(
                    { workspaceId: CURRENT_WS_ID },
                    { $set: { workspaceId: TARGET_ID } }
                );
                console.log(`Updated ${userResult.modifiedCount} users to use target workspace ID`);
            } else {
                console.log('Could not find the current workspace to clone.');
            }
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

fixWorkspace();
