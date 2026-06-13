import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function testSync() {
    try {
        await mongoose.connect(process.env.MONGODB_URI!);
        console.log('Connected to MongoDB\n');

        const SocialAccountService = (await import('./server/services/SocialAccountService.js')).default;
        const service = new SocialAccountService();

        const REAL_ACCOUNT_ID = '6872e064de14dd309d8b1961';

        console.log(`Testing sync for account: ${REAL_ACCOUNT_ID}\n`);

        const result = await service.syncAccount(REAL_ACCOUNT_ID);

        console.log('\n✅ Sync completed!');
        console.log(JSON.stringify(result, null, 2));

    } catch (error: any) {
        console.error('🚨 Sync Error:', error.message);
        console.error('Stack:', error.stack);
    } finally {
        await mongoose.disconnect();
    }
}

testSync();
