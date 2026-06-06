
import dotenv from 'dotenv';
import path from 'path';
import mongoose from 'mongoose';

// Load env vars from root
dotenv.config({ path: path.join(process.cwd(), '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

async function resetTokens() {
    if (!MONGODB_URI) {
        console.error('MONGODB_URI not found in env');
        return;
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI, { dbName: 'veeforedb' });
    console.log('Connected.');

    const result = await (mongoose.connection.db as any).collection('socialaccounts').updateMany(
        { platform: 'instagram' },
        { $set: { tokenStatus: 'invalid', isActive: false } }
    );

    console.log(`Updated ${result.modifiedCount} Instagram accounts to 'invalid'.`);
    console.log('User must re-link these accounts to restore metrics sync.');

    await mongoose.disconnect();
}

resetTokens().catch(console.error);
