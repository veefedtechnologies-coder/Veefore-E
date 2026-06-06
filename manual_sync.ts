import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function manualSync() {
    try {
        await mongoose.connect(process.env.MONGODB_URI!);
        console.log('Connected to MongoDB\n');

        // Import the actual service
        const { socialAccountService } = await import('./server/services/index.js');

        //  The REAL account ID from the database
        const REAL_ACCOUNT_ID = '6872e064de14dd309d8b1961';

        console.log(`Manually triggering sync for account: ${REAL_ACCOUNT_ID}`);

        const result = await socialAccountService.syncAccount(REAL_ACCOUNT_ID);

        console.log('\n✅ Sync completed successfully!');
        console.log('Result:', result);

    } catch (error) {
        console.error('🚨 Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

manualSync();
