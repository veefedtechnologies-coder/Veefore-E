import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { SocialAccountModel } from '../models/Social';

dotenv.config();

async function testDatabaseWrite() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI!);
        console.log('✅ Connected to MongoDB\n');

        // Test data
        const testAccount = {
            workspaceId: '6847b9cdfabaede1706f2994', // Your workspace ID
            platform: 'instagram',
            username: 'test_account_diagnostic',
            accountId: 'TEST_' + Date.now(),
            isActive: true,
            encryptedAccessToken: {
                encryptedData: 'test_encrypted',
                iv: 'test_iv',
                salt: 'test_salt',
                tag: 'test_tag'
            },
            totalShares: 0,
            totalSaves: 0,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        console.log('🧪 Attempting to create test account...');
        console.log('Payload:', JSON.stringify(testAccount, null, 2));

        const result = await SocialAccountModel.create(testAccount);

        console.log('\n✅ SUCCESS! Account created:', {
            id: result._id?.toString(),
            username: result.username,
            platform: result.platform
        });

        // Verify it was actually saved
        const verification = await SocialAccountModel.findById(result._id);
        console.log('\n✅ VERIFICATION: Account exists in database:', !!verification);

        // Clean up
        await SocialAccountModel.deleteOne({ _id: result._id });
        console.log('\n🧹 Test account cleaned up');

        await mongoose.disconnect();
        console.log('\n✅ DATABASE WRITE TEST: PASSED');
    } catch (error) {
        console.error('\n❌ DATABASE WRITE TEST: FAILED');
        console.error('Error:', error);
        console.error('Stack:', (error as Error).stack);
        process.exit(1);
    }
}

testDatabaseWrite();
