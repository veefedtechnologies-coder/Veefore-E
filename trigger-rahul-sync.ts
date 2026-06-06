import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();
dotenv.config({ path: 'server/.env' });

import { MongoStorage } from './server/mongodb-storage';
import { InstagramDirectSync } from './server/instagram-direct-sync';

async function triggerSync() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || '', { dbName: 'veeforedb' });
        console.log('✅ Connected to MongoDB');

        const storage = new MongoStorage();
        const syncService = new InstagramDirectSync(storage);

        // rahulc1020 workspaceId
        const workspaceId = '68b723f16bcd3c9930f28762';

        console.log('🚀 Triggering sync for rahulc1020...');
        await syncService.updateAccountWithRealData(workspaceId);
        console.log('✅ Sync completed');

    } catch (error: any) {
        console.error('❌ Sync failed:', error.message);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

triggerSync();
