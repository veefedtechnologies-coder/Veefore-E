
import mongoose from 'mongoose';
import { SocialAccountModel } from '../models/Social';
import dotenv from 'dotenv';
import path from 'path';

// Fix for strictQuery warning
mongoose.set('strictQuery', false);

async function cleanup() {
    console.log('--- Cleanup: Removing Test Accounts ---');

    // Load env from project root (server/../.env)
    const envPath = path.resolve(process.cwd(), '../.env');
    console.log(`Loading .env from: ${envPath}`);
    dotenv.config({ path: envPath });

    try {
        const mongoUri = process.env.MONGODB_URI;
        if (!mongoUri) {
            throw new Error('MONGODB_URI not found in environment');
        }
        console.log('Connecting to MongoDB...');
        await mongoose.connect(mongoUri);
        console.log('Connected.');

        const workspaceId = 'test-workspace-persistence';

        // 1. Find existing
        const accounts = await SocialAccountModel.find({ workspaceId });
        console.log(`Found ${accounts.length} accounts for workspace '${workspaceId}'.`);

        if (accounts.length > 0) {
            accounts.forEach(a => {
                console.log(`- Deleting: [${a.platform}] @${a.username} (ID: ${a._id})`);
            });

            // 2. Delete
            const result = await SocialAccountModel.deleteMany({ workspaceId });
            console.log(`\nDeleted ${result.deletedCount} accounts.`);
        } else {
            console.log('No accounts found to delete.');
        }

    } catch (error) {
        console.error('Cleanup failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\nDone.');
    }
}

cleanup();
