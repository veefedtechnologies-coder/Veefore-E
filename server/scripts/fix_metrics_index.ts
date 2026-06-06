import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env') });

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/veeforedb');
        console.log(`📦 MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`Error: ${(error as Error).message}`);
        process.exit(1);
    }
};

const fixMetricsIndex = async () => {
    try {
        // Import the Metrics model dynamically
        const { default: Metrics } = await import('../models/Metrics');

        console.log('🔍 Checking for obsolete indexes in Metrics collection...');

        // Get all indexes
        const indexes = await Metrics.collection.indexes();
        console.log('Current Indexes:', JSON.stringify(indexes, null, 2));

        const obsoleteIndexName = 'workspaceId_1_userId_1_instagramUserId_1';

        const hasObsoleteIndex = indexes.some(idx => idx.name === obsoleteIndexName);

        if (hasObsoleteIndex) {
            console.warn(`⚠️ Found obsolete index: ${obsoleteIndexName}`);
            console.log('🗑️ Dropping index...');
            await Metrics.collection.dropIndex(obsoleteIndexName);
            console.log('✅ Index dropped successfully!');
        } else {
            console.log('✅ No obsolete index found. Database is clean.');
        }

    } catch (error) {
        console.error('❌ Migration failed:', error);
    } finally {
        await mongoose.connection.close();
        process.exit();
    }
};

// Run the script
(async () => {
    await connectDB();
    await fixMetricsIndex();
})();
