
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env') });

const connectDB = async () => {
    try {
        console.log('DEBUG: Env Key present?', !!process.env.TOKEN_ENCRYPTION_KEY);
        if (process.env.TOKEN_ENCRYPTION_KEY) {
            console.log('DEBUG: Env Key length:', process.env.TOKEN_ENCRYPTION_KEY.length);
            console.log('DEBUG: Env Key start:', process.env.TOKEN_ENCRYPTION_KEY.substring(0, 4));
        }
        await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'veeforedb' });
        console.log('📦 MongoDB Connected to veeforedb');
    } catch (error) {
        console.error('❌ MongoDB Connection Error:', error);
        process.exit(1);
    }
};

const runDiagnostics = async () => {
    await connectDB();

    console.log('\n🔍 --- STARTING DIAGNOSTICS ---\n');

    const SocialAccount = mongoose.connection.collection('socialaccounts');
    const targetAccountId = '69882372f5077d91457e876a';

    const acc = await SocialAccount.findOne({ _id: new mongoose.Types.ObjectId(targetAccountId) });
    if (!acc) {
        console.log('❌ Target account not found in veeforedb');
    } else {
        console.log(`✅ Found account @${acc.username}`);
        console.log(`   Followers: ${acc.followersCount || acc.followers}`);
        console.log(`   Media Count: ${acc.mediaCount}`);
        console.log(`   Reach (DB): ${acc.totalReach}`);
    }

    try {
        const { socialAccountService } = await import('./server/services/SocialAccountService');
        console.log('\n🚀 Triggering syncAccount...');
        const result = await socialAccountService.syncAccount(targetAccountId);
        console.log('✅ Sync Completed!');
        console.log('Result:', JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('🚨 SYNC FAILED:', error.message);
    }

    await mongoose.disconnect();
    process.exit(0);
};

runDiagnostics();
